import UIKit
import SwiftUI
import UniformTypeIdentifiers

// Share extension entry — the whole reason the iOS app exists. Hosts the
// SwiftUI save flow over a clear background so the sheet reads as Bulletin's
// card floating over the host app.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let flow = SaveFlowView(
            payload: SharePayload(extensionContext: extensionContext),
            done: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        )
        let host = UIHostingController(rootView: flow)
        host.view.backgroundColor = .clear
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)
    }
}

// Extracts the shared URL plus whatever page context the host app provides.
struct SharePayload {
    let extensionContext: NSExtensionContext?

    struct Resolved {
        var url: String
        var title: String?          // document.title → save body.title
        var clientMeta: [String: String]  // og tags → save body.clientMeta
    }

    func resolve() async -> Resolved? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }

        var url: String?
        var title: String?
        var meta: [String: String] = [:]

        for item in items {
            for provider in item.attachments ?? [] {
                // Plain URL shares (every non-browser app).
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
                   loaded.scheme?.hasPrefix("http") == true {
                    url = url ?? loaded.absoluteString
                }
                // Links shared as text (some apps), or a bare text title.
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if let asURL = URL(string: trimmed), asURL.scheme?.hasPrefix("http") == true {
                        url = url ?? trimmed
                    }
                }
            }
            if title == nil, let t = item.attributedTitle?.string ?? item.attributedContentText?.string,
               !t.isEmpty, !t.hasPrefix("http") {
                title = t
            }
        }

        guard let url else { return nil }
        return Resolved(url: url, title: title, clientMeta: meta)
    }
}
