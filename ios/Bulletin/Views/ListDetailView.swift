import SwiftUI

// A list's page — name in the editorial voice over the same masonry as home. Reads GET /api/extension/lists?list_id=.
struct ListDetailView: View {
    let list: API.List

    @State private var detail: API.ListDetail?
    @State private var error: String?

    var body: some View {
        ZStack {
            DotGround()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(list.name)
                        .font(.mier(28))
                        .kerning(-0.5)
                        .foregroundStyle(Color.ink)
                        .padding(.top, 8)

                    if let error {
                        Text(error)
                            .font(.cardo(14))
                            .foregroundStyle(Color.ink.opacity(0.5))
                            .padding(.top, 32)
                            .frame(maxWidth: .infinity)
                    } else if let detail {
                        BulletGrid(bullets: detail.bullets)
                            .padding(.top, 20)
                            .padding(.bottom, 40)
                    } else {
                        ProgressView()
                            .padding(.top, 64)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                detail = try await API.listDetail(listId: list.id)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
