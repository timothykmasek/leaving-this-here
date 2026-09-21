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

    private let columns = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

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

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 22) {
            ForEach(bullets) { bullet in
                BulletCard(bullet: bullet)
            }
        }
        .padding(.top, 16)
        .padding(.bottom, 40)
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

// Card styling follows the mobile web profile: a borderless rounded image
// sitting straight on the dot ground, sans title below, serif detail line —
// no boxed white cards.
struct BulletCard: View {
    let bullet: API.Bullet

    private var domain: String {
        URL(string: bullet.url)?.host?.replacingOccurrences(of: "www.", with: "") ?? bullet.url
    }

    var body: some View {
        Link(destination: URL(string: bullet.url) ?? Config.siteURL) {
            VStack(alignment: .leading, spacing: 0) {
                // The plate owns the layout; the image only paints inside it.
                // (A bare scaledToFill AsyncImage claims its intrinsic width
                // and blows the grid columns past the screen edge.)
                // PrimaryCard spec: 20px radius, hairline #EBEBEB border.
                Color.cardGrey
                    .frame(height: 124)
                    .overlay(
                        AsyncImage(url: bullet.cardImage.flatMap(URL.init)) { phase in
                            if case .success(let image) = phase {
                                image.resizable().scaledToFill()
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

                // The web's editorial line (serif, ink 55%); domain stands in
                // until finds carries per-bullet list membership.
                Text(domain)
                    .font(.cardo(13))
                    .foregroundStyle(Color.ink.opacity(0.55))
                    .lineLimit(1)
                    .padding(.top, 3)
            }
        }
    }
}
