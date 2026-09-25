import SwiftUI

// The share extension's sheet: Bulletin paper with the dot grid, wordmark on
// top, a quiet × at its left, and the shared SaveCeremonyView doing
// the actual work as full-bleed rows. (The system presents custom share UI
// as a full opaque sheet — no host app behind it — so we own the sheet.)
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
            VStack(spacing: 0) {
                ZStack {
                    Wordmark(height: 30)
                        .frame(maxWidth: .infinity)
                    HStack {
                        SheetCloseButton(action: done)
                        Spacer()
                    }
                    .padding(.leading, 14)
                }
                .padding(.top, 26)

                switch stage {
                case .resolving:
                    SaveCeremonyView.Skeleton()
                    Spacer()

                case .save(let resolved):
                    SaveCeremonyView(
                        url: resolved.url,
                        title: resolved.title,
                        clientMeta: resolved.clientMeta,
                        done: done
                    )

                case .failed(let message):
                    SaveCeremonyView.Headline("Couldn't save")
                    Text(message)
                        .font(.cardo(15))
                        .foregroundStyle(Color.ink.opacity(0.65))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)
                    Spacer()
                }
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
}
