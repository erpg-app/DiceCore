package dicecore

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestEventStringEveryByteMatchesStandardJSON(t *testing.T) {
	for code := range 256 {
		character := string([]byte{byte(code)})
		standard, err := json.Marshal(character)
		if err != nil {
			t.Fatal(err)
		}
		// In particular, DEL (0x7f) is emitted literally by encoding/json.
		// Verify classification too: a needless fallback has identical bytes.
		literal := len(standard) == 3 && standard[1] == byte(code)
		if (eventJSONSafeASCII[code] != 0) != literal {
			t.Fatalf("byte %02x: fast path=%v, standard=%q", code, eventJSONSafeASCII[code], standard)
		}
		for _, value := range []string{character, "prefix" + character, character + "suffix", "prefix" + character + "suffix"} {
			want, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if got := appendEventString(nil, value); !bytes.Equal(got, want) {
				t.Fatalf("byte %02x in %q: got %q, want %q", code, value, got, want)
			}
			prefix := []byte("existing\x00\xff:")
			buffer := append(make([]byte, 0, len(prefix)+len(want)+16), prefix...)
			got := appendEventString(buffer, value)
			if !bytes.Equal(got[:len(prefix)], prefix) || !bytes.Equal(got[len(prefix):], want) {
				t.Fatalf("byte %02x in %q: prefix append changed: %q", code, value, got)
			}
		}
	}
}

func TestEventStringEscapesAtEveryBlockAndTailPosition(t *testing.T) {
	for length := 1; length <= 12; length++ {
		for position := 0; position < length; position++ {
			for code := range 256 {
				value := strings.Repeat("a", position) + string([]byte{byte(code)}) + strings.Repeat("z", length-position-1)
				want, err := json.Marshal(value)
				if err != nil {
					t.Fatal(err)
				}
				for _, capacity := range []int{0, len(want) + 16} {
					prefix := []byte("prefix\x00\xff:")
					dst := make([]byte, len(prefix), len(prefix)+capacity)
					copy(dst, prefix)
					got := appendEventString(dst, value)
					if !bytes.Equal(got[:len(prefix)], prefix) || !bytes.Equal(got[len(prefix):], want) {
						t.Fatalf("length=%d position=%d byte=%02x: got %q, want %q", length, position, code, got, want)
					}
				}
			}
		}
	}
}
