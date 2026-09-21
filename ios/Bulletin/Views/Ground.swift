import SwiftUI

// The dot-grid ground — the web app's `.dot-ground` (2px dot on a 32px
// pitch, rivet grey on paper white) as a tiled Canvas. One drawing pass,
// no 15k views; same reasoning as the CSS radial-gradient tile.
struct DotGround: View {
    var body: some View {
        Canvas { context, size in
            let pitch: CGFloat = 32
            let dot: CGFloat = 2
            let color = Color(red: 0.85, green: 0.85, blue: 0.85)  // #d9d9d9 rivet
            var y: CGFloat = pitch / 2
            while y < size.height {
                var x: CGFloat = pitch / 2
                while x < size.width {
                    context.fill(
                        Path(ellipseIn: CGRect(x: x - dot / 2, y: y - dot / 2, width: dot, height: dot)),
                        with: .color(color)
                    )
                    x += pitch
                }
                y += pitch
            }
        }
        .background(Color.white)
        .ignoresSafeArea()
    }
}
