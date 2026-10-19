package dicecore

import "testing"

func BenchmarkRollPathfinder2e(b *testing.B) {
	modifier, difficulty := int64(7), int64(20)
	for _, fortune := range []string{"normal", "fortune", "misfortune"} {
		b.Run(fortune, func(b *testing.B) {
			input := Pathfinder2eRollInput{Modifier: &modifier, Difficulty: &difficulty, Fortune: fortune}
			options := SystemRollOptions{RollOptions: RollOptions{Seed: "pf2-benchmark"}, Detail: "compact"}
			b.ReportAllocs()
			for b.Loop() {
				if _, err := RollPathfinder2e(input, options); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
