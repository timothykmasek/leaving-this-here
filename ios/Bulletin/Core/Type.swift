import SwiftUI

// The brand type system (mirror of app/fonts.ts):
//   Mier A  → headlines, body, UI labels (Book 400; DemiBold 600 for buttons)
//   Cardo   → editorial only: taglines, detail lines, the save-card headline
// PostScript names from the converted files: MierA-Book, MierA-DemiBold,
// Cardo-Regular, Cardo-Italic, Cardo-Bold (bundled via UIAppFonts in both
// targets' Info.plists). Headlines are Book 400, NOT DemiBold — the same
// "looks too light is the intended voice" rule as the web.
extension Font {
    static func mier(_ size: CGFloat) -> Font {
        .custom("MierA-Book", size: size)
    }
    static func mierDemi(_ size: CGFloat) -> Font {
        .custom("MierA-DemiBold", size: size)
    }
    static func cardo(_ size: CGFloat) -> Font {
        .custom("Cardo-Regular", size: size)
    }
    static func cardoItalic(_ size: CGFloat) -> Font {
        .custom("Cardo-Italic", size: size)
    }
}
