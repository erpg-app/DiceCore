package dicecore

import (
	"fmt"
	"math"
	"unicode/utf16"
)

const Pathfinder2eD20Profile = "pathfinder2e-d20"

type Pathfinder2eRollInput struct {
	Modifier   *int64            `json:"modifier,omitempty"`
	Difficulty *int64            `json:"difficulty,omitempty"`
	Fortune    string            `json:"fortune,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
}

type Pathfinder2eDieResult struct {
	SystemDieResult
	Selected bool `json:"selected"`
}

type Pathfinder2eRollResult struct {
	systemResultHeader
	Modifier    int64                   `json:"modifier"`
	Difficulty  *int64                  `json:"difficulty"`
	Natural     float64                 `json:"natural"`
	Total       float64                 `json:"total"`
	Margin      *float64                `json:"margin"`
	Fortune     string                  `json:"fortune"`
	Degree      string                  `json:"degree"`
	Succeeds    *bool                   `json:"succeeds"`
	DegreeLabel string                  `json:"degreeLabel"`
	Dice        []Pathfinder2eDieResult `json:"dice"`
	BaseRoll    any                     `json:"baseRoll"`
}

var pathfinder2eDegrees = [...]string{"critical-failure", "failure", "success", "critical-success"}

func pathfinder2eLabels(source map[string]any) (map[string]string, error) {
	value, present := source["labels"]
	if !present {
		return nil, nil
	}
	labels, ok := value.(map[string]any)
	if !ok || labels == nil {
		return nil, invalidSystemInput("pathfinder2e", "labels", "must be a non-null object")
	}
	result := make(map[string]string, len(labels))
	for key, value := range labels {
		valid := key == "pending"
		for _, degree := range pathfinder2eDegrees {
			valid = valid || key == degree
		}
		text, isText := value.(string)
		if !valid || !isText || syntaxTrimSpace(text) == "" || len(utf16.Encode([]rune(text))) > 128 {
			return nil, invalidSystemInput("pathfinder2e", "labels", "must contain degree names and non-empty strings up to 128 characters")
		}
		result[key] = text
	}
	return result, nil
}

func RollPathfinder2e(input any, options ...SystemRollOptions) (*Pathfinder2eRollResult, error) {
	return RollPathfinder2eWithEngine(DefaultDiceEngine(), input, options...)
}

func RollPathfinder2eWithEngine(engine SystemEngine, input any, options ...SystemRollOptions) (*Pathfinder2eRollResult, error) {
	source, err := readSystemInput(input, "pathfinder2e")
	if err != nil {
		return nil, err
	}
	modifierValue, err := readSystemInteger(source, "pathfinder2e", "modifier", -maxSafeInteger+20, maxSafeInteger-20, false)
	if err != nil {
		return nil, err
	}
	var difficulty *int64
	if source["difficulty"] != nil {
		difficulty, err = readSystemInteger(source, "pathfinder2e", "difficulty", 0, maxSafeInteger, false)
		if err != nil {
			return nil, err
		}
	}
	fortune := "normal"
	if value, present := source["fortune"]; present {
		fortune, _ = value.(string)
		if fortune != "normal" && fortune != "fortune" && fortune != "misfortune" {
			return nil, invalidSystemInput("pathfinder2e", "fortune", "must be normal, fortune, or misfortune")
		}
	}
	labels, err := pathfinder2eLabels(source)
	if err != nil {
		return nil, err
	}
	count := 1
	if fortune != "normal" {
		count = 2
	}
	dice, base, err := executeSystemRoll(engine, fmt.Sprintf("%dd20", count), systemOptions(options))
	if err != nil {
		return nil, err
	}
	if len(dice) != count {
		return nil, fmt.Errorf("PF2 checks must resolve exactly %d valid d20 dice.", count)
	}
	result := &Pathfinder2eRollResult{systemResultHeader: systemHeader("pathfinder2e"), Modifier: systemDefault(modifierValue, 0), Difficulty: difficulty, Fortune: fortune, Degree: "pending", Dice: make([]Pathfinder2eDieResult, count), BaseRoll: base}
	selected := 0
	for index, die := range dice {
		sides, ok := seedNumber(die.Sides)
		if !ok || sides != 20 || die.RawValue < 1 || die.RawValue > 20 || math.IsNaN(die.RawValue) || math.Trunc(die.RawValue) != die.RawValue {
			return nil, fmt.Errorf("PF2 checks must resolve exactly %d valid d20 dice.", count)
		}
		projected, err := projectSystemDie(die, Pathfinder2eD20Profile, "d20", systemNumber(die.RawValue), nil)
		if err != nil {
			return nil, err
		}
		result.Dice[index] = Pathfinder2eDieResult{SystemDieResult: projected}
		if fortune == "fortune" && die.RawValue > dice[selected].RawValue || fortune == "misfortune" && die.RawValue < dice[selected].RawValue {
			selected = index
		}
	}
	result.Dice[selected].Selected = true
	result.Natural = dice[selected].RawValue
	result.Total = result.Natural + float64(result.Modifier)
	if difficulty != nil {
		margin := result.Total - float64(*difficulty)
		if math.Abs(margin) > float64(maxSafeInteger) {
			return nil, invalidSystemInput("pathfinder2e", "difficulty", "must produce a safe integer margin")
		}
		result.Margin = &margin
		degree := 1
		switch {
		case margin >= 10:
			degree = 3
		case margin >= 0:
			degree = 2
		case margin <= -10:
			degree = 0
		}
		if result.Natural == 20 {
			degree = min(3, degree+1)
		} else if result.Natural == 1 {
			degree = max(0, degree-1)
		}
		result.Degree = pathfinder2eDegrees[degree]
		succeeds := degree >= 2
		result.Succeeds = &succeeds
	}
	result.DegreeLabel = result.Degree
	if label, ok := labels[result.Degree]; ok {
		result.DegreeLabel = label
	}
	return result, nil
}

func (r *SystemRoller) RollPathfinder2e(input any, options ...SystemRollOptions) (*Pathfinder2eRollResult, error) {
	return RollPathfinder2eWithEngine(r.engine, input, options...)
}

func (r *Pathfinder2eRollResult) systemBaseRoll() any { return r.BaseRoll }
