// Evaluate @xtandard/flags from Go via the standard OpenFeature SDK + the
// generic OFREP provider — no vendor-specific library.
//
//	go mod tidy && go run .   // reads FLAGS_URL (default http://localhost:8080)
//
// The panel must be running and seeded (see ../README.md + ../seed.sh).
package main

import (
	"context"
	"fmt"
	"os"

	ofrep "github.com/open-feature/go-sdk-contrib/providers/ofrep"
	"github.com/open-feature/go-sdk/openfeature"
)

func main() {
	base := os.Getenv("FLAGS_URL")
	if base == "" {
		base = "http://localhost:8080"
	}

	if err := openfeature.SetProviderAndWait(ofrep.NewProvider(base)); err != nil {
		panic(err)
	}
	client := openfeature.NewClient("app")

	// Same context any OpenFeature SDK sends: a targeting key + attributes.
	ctx := openfeature.NewEvaluationContext("user-42", map[string]any{"plan": "beta"})

	newCheckout, _ := client.BooleanValue(context.Background(), "new-checkout", false, ctx)
	banner, _ := client.StringValueDetails(context.Background(), "banner-color", "#000000", ctx)

	fmt.Printf("OFREP @ %s\n", base)
	fmt.Printf("  new-checkout = %v\n", newCheckout)
	fmt.Printf("  banner-color = %s  (reason=%s, variant=%s)\n", banner.Value, banner.Reason, banner.Variant)
}
