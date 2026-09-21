import SwiftUI

// Home — deliberately thin for v0.1: recent saves in a two-column grid and a
// pointer to the full bulletin on the web. The app's hero is the share
// extension; this screen is proof of life, not the museum. (The native
// masonry with per-type cards is the v0.2 investment.)
struct HomeView: View {
    @EnvironmentObject private var session: Session
    @State private var bullets: [API.Bullet] = []
    @State private var lists: [API.List] = []
    @State private var loading = true
    @State private var error: String?


    var body: some View {
        ZStack {
            DotGround()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    if let error {
                        Text(error)
                            .font(.cardo(14))
                            .foregroundStyle(Color.ink.opacity(0.5))
                            .padding(.top, 32)
                            .frame(maxWidth: .infinity)
                    } else if loading {
                        ProgressView()
                            .padding(.top, 64)
                            .frame(maxWidth: .infinity)
                    } else {
                        if !lists.isEmpty { listStrip }
                        grid
                    }
                }
                .padding(.horizontal, 16)
            }
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private var header: some View {
        HStack(alignment: .center) {
            Wordmark(height: 30)
            Spacer()
            if let username = session.current?.username,
               let url = URL(string: "\(Config.siteURL)/\(username)") {
                Link("Open on the web", destination: url)
                    .font(.cardo(13))
                    .foregroundStyle(Color.ink.opacity(0.45))
            }
            Button("Sign out") { session.signOut() }
                .font(.cardo(13))
                .foregroundStyle(Color.ink.opacity(0.45))
        }
        .padding(.top, 12)
    }

    private var listStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(lists) { list in
                    Text(list.name)
                        .font(.mier(13))
                        .foregroundStyle(Color.ink.opacity(0.7))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Color.cardGrey, in: Capsule())
                }
            }
        }
        .padding(.top, 20)
    }

    // Masonry, the web way: two independent columns split by index, each card
    // at its image's natural aspect — no equal-height rows.
    private var grid: some View {
        HStack(alignment: .top, spacing: 14) {
            masonryColumn(bullets.enumerated().filter { $0.offset % 2 == 0 }.map(\.element))
            masonryColumn(bullets.enumerated().filter { $0.offset % 2 == 1 }.map(\.element))
        }
        .padding(.top, 16)
        .padding(.bottom, 40)
    }

    private func masonryColumn(_ items: [API.Bullet]) -> some View {
        LazyVStack(alignment: .leading, spacing: 22) {
            ForEach(items) { bullet in
                BulletCard(bullet: bullet)
            }
        }
    }

    private func load() async {
        do {
            async let findsTask = API.finds(limit: 40)
            async let listsTask = API.lists()
            let (page, listsResponse) = try await (findsTask, listsTask)
            bullets = page.finds
            lists = listsResponse.lists
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

// PrimaryCard, ported by measurement: natural-aspect plate at 20px radius
// with the hairline #EBEBEB border, muted sans title, Cardo list line with
// the three-dot tick. Outbound clicks carry render-time bulletin utms.
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
