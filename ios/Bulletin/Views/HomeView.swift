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

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ZStack {
            DotGround()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    if let error {
                        Text(error)
                            .font(.system(size: 14, design: .serif))
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
        HStack(alignment: .firstTextBaseline) {
            Text("Bulletin")
                .font(.system(size: 28, weight: .regular))
                .kerning(-0.5)
                .foregroundStyle(Color.ink)
            Spacer()
            if let username = session.current?.username,
               let url = URL(string: "\(Config.siteURL)/\(username)") {
                Link("Open on the web", destination: url)
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(Color.ink.opacity(0.45))
            }
            Button("Sign out") { session.signOut() }
                .font(.system(size: 13, design: .serif))
                .foregroundStyle(Color.ink.opacity(0.45))
        }
        .padding(.top, 12)
    }

    private var listStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(lists) { list in
                    Text(list.name)
                        .font(.system(size: 13, weight: .medium))
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
        LazyVGrid(columns: columns, spacing: 12) {
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

struct BulletCard: View {
    let bullet: API.Bullet

    private var domain: String {
        URL(string: bullet.url)?.host?.replacingOccurrences(of: "www.", with: "") ?? bullet.url
    }

    var body: some View {
        Link(destination: URL(string: bullet.url) ?? Config.siteURL) {
            VStack(alignment: .leading, spacing: 0) {
                AsyncImage(url: bullet.image_url.flatMap(URL.init)) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        Color.cardGrey
                    }
                }
                .frame(height: 130)
                .clipped()

                VStack(alignment: .leading, spacing: 3) {
                    Text(bullet.title ?? domain)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Color.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text(domain)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(Color.ink.opacity(0.4))
                        .lineLimit(1)
                }
                .padding(10)
            }
            .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.black.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        }
    }
}
