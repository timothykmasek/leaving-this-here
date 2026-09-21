import SwiftUI

// The share extension's sheet: Bulletin paper with the dot grid, wordmark on
// top, and the shared SaveCeremonyView doing the actual work. (The system
// presents custom share UI as a full opaque sheet — no host app behind it —
// so we own the sheet rather than faking a scrim.)
struct SaveFlowView: View {
    let payload: SharePayload
    let done: () -> Void

    enum Stage {
        case resolving
        case save(SharePayload.Resolved)
        case failed(String)
    }

    @State private var stage: Stage = .resolving

    var body: some View {
        ZStack {
            DotGround()
            VStack(alignment: .leading, spacing: 0) {
                Wordmark(height: 30)
                    .padding(.top, 26)
                    .frame(maxWidth: .infinity)
                Spacer()
                card
                    .padding(.horizontal, 26)
                Spacer()
                Spacer()
            }
        }
        .task {
            if let resolved = await payload.resolve() {
                stage = .save(resolved)
            } else {
                stage = .failed("Couldn't find a link in what was shared.")
            }
        }
    }

    @ViewBuilder
    private var card: some View {
        switch stage {
        case .resolving:
            HStack(spacing: 10) {
                ProgressView()
                Text("Saving…")
                    .font(.cardo(15))
                    .foregroundStyle(Color.ink.opacity(0.55))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 36)
            .padding(22)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.18), radius: 24, y: 10)

        case .save(let resolved):
            SaveCeremonyView(
                url: resolved.url,
                title: resolved.title,
                clientMeta: resolved.clientMeta,
                done: done
            )

        case .failed(let message):
            VStack(alignment: .leading, spacing: 0) {
                Text(message)
                    .font(.cardo(15))
                    .foregroundStyle(Color.ink.opacity(0.65))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
                Button(action: done) {
                    Text("Close")
                        .font(.mierDemi(15))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(.white)
                }
                .padding(.top, 18)
            }
            .padding(22)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.18), radius: 24, y: 10)
        }
    }
}
