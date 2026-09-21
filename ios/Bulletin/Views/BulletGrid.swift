import SwiftUI

// The masonry grid + card, shared by Home, list pages, and search results.
// Two independent columns split by index (the web way), every plate at its
// image's natural aspect.
struct BulletGrid: View {
    let bullets: [API.Bullet]

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            column(bullets.enumerated().filter { $0.offset % 2 == 0 }.map(\.element))
            column(bullets.enumerated().filter { $0.offset % 2 == 1 }.map(\.element))
        }
    }

    private func column(_ items: [API.Bullet]) -> some View {
        LazyVStack(alignment: .leading, spacing: 22) {
            ForEach(items) { bullet in
                BulletCard(bullet: bullet)
            }
        }
    }
}

// PrimaryCard, ported by measurement: natural-aspect plate at 20px radius
// with the hairline #EBEBEB border, muted sans title, Cardo list line with
// the three-dot tick. Outbound taps carry render-time bulletin utms.
struct BulletCard: View {
    let bullet: API.Bullet

    // Natural image aspect, discovered on load; 4:3 stands in until then.
    // Clamped so one extreme screenshot can't produce a skyscraper card.
    @State private var aspect: CGFloat = 4.0 / 3.0
    @State private var image: UIImage?

    private var domain: String {
        URL(string: bullet.url)?.host?.replacingOccurrences(of: "www.", with: "") ?? bullet.url
    }

    var body: some View {
        Link(destination: withBulletinUtm(bullet.url) ?? Config.siteURL) {
            VStack(alignment: .leading, spacing: 0) {
                Color.clear
                    .aspectRatio(aspect, contentMode: .fit)
                    .overlay(
                        Group {
                            if let image {
                                Image(uiImage: image).resizable().scaledToFill()
                            } else {
                                Color.cardGrey
                            }
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(Color(red: 0xEB / 255, green: 0xEB / 255, blue: 0xEB / 255), lineWidth: 1)
                    )

                // PrimaryCard title voice: sans 14/400, +0.05em, black 56%.
                Text(bullet.cardTitle)
                    .font(.mier(14))
                    .kerning(0.7)
                    .foregroundStyle(Color.black.opacity(0.56))
                    .lineLimit(1)
                    .multilineTextAlignment(.leading)
                    .padding(.top, 12)

                // List line (Cardo + three-dot tick), domain when unfiled.
                HStack(spacing: 7) {
                    if bullet.listName != nil {
                        VStack(spacing: 2) {
                            ForEach(0..<3) { _ in
                                Circle().frame(width: 2, height: 2)
                            }
                        }
                        .opacity(0.6)
                    }
                    Text(bullet.listName ?? domain)
                        .font(.cardo(14))
                        .lineLimit(1)
                }
                .foregroundStyle(Color.ink.opacity(0.55))
                .padding(.top, 5)
            }
        }
        .task(id: bullet.cardImage) { await loadImage() }
    }

    private func loadImage() async {
        guard image == nil,
              let raw = bullet.cardImage, let url = URL(string: raw),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let ui = UIImage(data: data), ui.size.height > 0
        else { return }
        image = ui
        aspect = min(max(ui.size.width / ui.size.height, 0.66), 2.2)
    }
}
