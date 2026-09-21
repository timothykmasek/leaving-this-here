import SwiftUI

// The Bulletin wordmark image, with a typeset fallback. SwiftUI's Image(name)
// is unreliable for loose bundle PNGs across processes (app vs extension), so
// this loads through UIImage explicitly.
struct Wordmark: View {
    var height: CGFloat = 30

    var body: some View {
        if let ui = UIImage(named: "bulletin-logo") {
            Image(uiImage: ui)
                .resizable()
                .scaledToFit()
                .frame(height: height)
        } else {
            Text("Bulletin")
                .font(.system(size: height * 0.9, weight: .regular))
                .kerning(-0.5)
                .foregroundStyle(Color.ink)
        }
    }
}
