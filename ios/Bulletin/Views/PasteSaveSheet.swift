import SwiftUI
import UniformTypeIdentifiers

// Paste-to-save — the mobile twin of the web's + quick paste bar. A URL
// field with a system PasteButton (no clipboard-privacy banner), then the
// same SaveCeremonyView the share extension runs.
struct PasteSaveSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var input = ""
    @State private var saving: String?   // the URL being saved

    var body: some View {
        ZStack {
            DotGround()
            VStack(alignment: .leading, spacing: 0) {
                if let url = saving {
                    Spacer()
                    SaveCeremonyView(url: url) { dismiss() }
                    Spacer()
                } else {
                    Text("Add a link")
                        .font(.cardo(22))
                        .foregroundStyle(Color.ink)
                        .padding(.top, 28)

                    HStack(spacing: 8) {
                        TextField("https://…", text: $input)
                            .font(.system(size: 15, design: .monospaced))
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .submitLabel(.go)
                            .onSubmit(save)
                        PasteButton(payloadType: URL.self) { urls in
                            if let url = urls.first {
                                input = url.absoluteString
                                save()
                            }
                        }
                        .labelStyle(.iconOnly)
                        .buttonBorderShape(.capsule)
                        .tint(Color.ink)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.black.opacity(0.08), lineWidth: 1)
                    )
                    .padding(.top, 16)

                    Button(action: save) {
                        Text("Save to your bulletin")
                            .font(.mierDemi(15))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(.white)
                    }
                    .disabled(normalized == nil)
                    .opacity(normalized == nil ? 0.4 : 1)
                    .padding(.top, 14)

                    Spacer()
                }
            }
            .padding(.horizontal, 24)
        }
    }

    // A pasted link is often missing its scheme ("stripe.com") — supply it.
    private var normalized: String? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty, !s.contains(" ") else { return nil }
        if !s.lowercased().hasPrefix("http") { s = "https://" + s }
        guard let url = URL(string: s), url.host?.contains(".") == true else { return nil }
        return s
    }

    private func save() {
        guard let url = normalized else { return }
        saving = url
    }
}
