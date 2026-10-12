package dicecore

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"testing"
)

type pathfinder2eFixtureEngine struct {
	*Engine
	result  *DiceRollResult
	details *DiceRollDetails
	failure error
}

func (engine *pathfinder2eFixtureEngine) Roll(any, ...RollOptions) (*DiceRollResult, error) {
	return engine.result, engine.failure
}
func (engine *pathfinder2eFixtureEngine) RollDetails(any, ...RollOptions) (*DiceRollDetails, error) {
	return engine.details, engine.failure
}
func requirePathfinder2eErrorCode(t testing.TB, err error, code string) {
	t.Helper()
	var diceErr *DiceRollError
	if !errors.As(err, &diceErr) || diceErr.Code != code {
		t.Fatalf("expected error %s, got %v", code, err)
	}
}
func pathfinder2eEngine(faces ...float64) *pathfinder2eFixtureEngine {
	dice := make([]ResolvedDie, len(faces))
	for index, face := range faces {
		dice[index] = ResolvedDie{ID: fmt.Sprintf("die-%d", index+1), Sides: int64(20), Value: face, RawValue: face}
	}
	return &pathfinder2eFixtureEngine{Engine: DefaultDiceEngine(), result: &DiceRollResult{Dice: dice}}
}

func TestPathfinder2eDegreeBoundariesAndNaturalAdjustments(t *testing.T) {
	for _, tc := range []struct {
		natural, modifier, difficulty int64
		degree                        string
	}{
		{10, 0, 20, "critical-failure"}, {11, 0, 20, "failure"}, {19, 0, 20, "failure"},
		{10, 10, 20, "success"}, {19, 10, 20, "success"}, {10, 20, 20, "critical-success"},
		{20, 0, 40, "failure"}, {20, 0, 25, "success"}, {20, 0, 20, "critical-success"}, {20, 0, 10, "critical-success"},
		{1, 0, 20, "critical-failure"}, {1, 10, 20, "critical-failure"}, {1, 20, 20, "failure"}, {1, 30, 20, "success"},
	} {
		t.Run(fmt.Sprintf("%d+%d-vs-%d", tc.natural, tc.modifier, tc.difficulty), func(t *testing.T) {
			result, err := RollPathfinder2eWithEngine(pathfinder2eEngine(float64(tc.natural)), Pathfinder2eRollInput{Modifier: &tc.modifier, Difficulty: &tc.difficulty})
			if err != nil || result.Degree != tc.degree || result.Margin == nil || *result.Margin != result.Total-float64(tc.difficulty) {
				t.Fatalf("result=%+v err=%v", result, err)
			}
			if result.Succeeds == nil || *result.Succeeds != (result.Degree == "success" || result.Degree == "critical-success") {
				t.Fatal("succeeds disagrees with adjusted degree", result)
			}
		})
	}
}

func TestPathfinder2eFortuneAndPending(t *testing.T) {
	for _, tc := range []struct {
		fortune  string
		faces    []float64
		selected int
	}{
		{"normal", []float64{20}, 0}, {"fortune", []float64{1, 20}, 1}, {"misfortune", []float64{1, 20}, 0},
		{"fortune", []float64{12, 12}, 0}, {"misfortune", []float64{12, 12}, 0},
	} {
		result, err := RollPathfinder2eWithEngine(pathfinder2eEngine(tc.faces...), map[string]any{"fortune": tc.fortune, "difficulty": nil, "labels": map[string]any{"pending": " CD secreta "}})
		if err != nil || result.Degree != "pending" || result.DegreeLabel != " CD secreta " || result.Margin != nil || result.Succeeds != nil || result.Difficulty != nil || result.Natural != tc.faces[tc.selected] {
			t.Fatalf("result=%+v err=%v", result, err)
		}
		for index, die := range result.Dice {
			if die.Selected != (index == tc.selected) || die.ProfileID != Pathfinder2eD20Profile || die.FaceKey != systemNumber(tc.faces[index]) || die.Symbols == nil {
				t.Fatal("incorrect die projection", die)
			}
		}
	}
}

func TestPathfinder2eInvalidInputAndEngine(t *testing.T) {
	for _, input := range []any{
		"pf2", (*Pathfinder2eRollInput)(nil), map[string]any{"modifier": 1.5}, map[string]any{"modifier": math.NaN()},
		map[string]any{"modifier": maxSafeInteger}, map[string]any{"difficulty": -1}, map[string]any{"difficulty": "20"},
		map[string]any{"fortune": "both"}, map[string]any{"fortune": nil}, map[string]any{"labels": nil},
		map[string]any{"labels": map[string]any{"failure": " "}}, map[string]any{"labels": map[string]any{"pending": strings.Repeat("x", 129)}},
		map[string]any{"labels": map[string]any{"failure": 1}}, map[string]any{"labels": map[string]any{"unknown": "x"}},
	} {
		_, err := RollPathfinder2e(input)
		requirePathfinder2eErrorCode(t, err, "INVALID_SYSTEM_INPUT")
	}
	_, err := RollPathfinder2eWithEngine(pathfinder2eEngine(1), map[string]any{"modifier": -maxSafeInteger + 20, "difficulty": maxSafeInteger})
	requirePathfinder2eErrorCode(t, err, "INVALID_SYSTEM_INPUT")
	for _, faces := range [][]float64{{}, {1, 2}, {0}, {21}, {1.5}, {math.NaN()}} {
		if _, err := RollPathfinder2eWithEngine(pathfinder2eEngine(faces...), Pathfinder2eRollInput{}); err == nil {
			t.Fatalf("invalid faces accepted: %v", faces)
		}
	}
	engine := pathfinder2eEngine(12)
	engine.result.Dice[0].Sides = int64(12)
	if _, err := RollPathfinder2eWithEngine(engine, Pathfinder2eRollInput{}); err == nil {
		t.Fatal("non-d20 accepted")
	}
	engine.failure = fmt.Errorf("injected engine failure")
	if _, err := RollPathfinder2eWithEngine(engine, Pathfinder2eRollInput{}); err != engine.failure {
		t.Fatal("engine error not preserved", err)
	}
}

func TestPathfinder2eMixedReplayCompactAndAliases(t *testing.T) {
	for _, detail := range []string{"", "compact"} {
		for _, notation := range []string{"pf2()", "PF2E(7,20)", "pathfinder2e(7,null,1)", "pf2(mod=7,cd=20,fortuna=-1)", "d6;pf2(7,20,1);dh()"} {
			first, err := RollMixedDice(notation, MixedRollOptions{RollOptions: RollOptions{Seed: "pf2-parity"}, Detail: detail})
			if err != nil {
				t.Fatal(notation, err)
			}
			again, err := RollMixedDice(notation, MixedRollOptions{RollOptions: RollOptions{Replay: first.Replay}, Detail: detail})
			if err != nil || !reflect.DeepEqual(first, again) {
				t.Fatal("mixed replay differs", notation, err)
			}
			for _, item := range first.Rolls {
				if item.Kind == "pathfinder2e" {
					result := item.Result.(*Pathfinder2eRollResult)
					if !strings.Contains(formatMixedItem(item), "("+result.Degree+")") {
						t.Fatal("degree missing from output", first.Output)
					}
				}
			}
		}
	}
	for _, notation := range []string{"pf2(0,null,2)", "pf2(null)", "pf2(0,20,null)", "pf2(fortune=2)", "pf2(foo=1)", "pf2(1,2,3,4)", "dh(1,null)", "fate(null)"} {
		_, err := RollMixedDice(notation)
		requirePathfinder2eErrorCode(t, err, "INVALID_NOTATION")
	}
	engine, err := CreateDiceEngine(DiceEngineOptions{Limits: DiceLimitOverrides{"maxInitialDice": 1}})
	if err != nil {
		t.Fatal(err)
	}
	roller, err := CreateSystemRoller(engine)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := roller.RollPathfinder2e(Pathfinder2eRollInput{}, SystemRollOptions{RollOptions: RollOptions{Seed: 1}}); err != nil {
		t.Fatal(err)
	}
	_, err = roller.RollMixedDice("pf2(0,null,1)")
	requirePathfinder2eErrorCode(t, err, "TOO_MANY_INITIAL_DICE")
}

func TestPathfinder2eResultJSONNullContract(t *testing.T) {
	result, err := RollPathfinder2eWithEngine(pathfinder2eEngine(1), Pathfinder2eRollInput{})
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{`"difficulty":null`, `"margin":null`, `"succeeds":null`, `"selected":true`, `"degree":"pending"`, `"system":"pathfinder2e"`} {
		if !strings.Contains(string(data), field) {
			t.Fatalf("missing %s in %s", field, data)
		}
	}
}
