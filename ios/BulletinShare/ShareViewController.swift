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

// Extracts the shared URL (+ page title when the host app provides one).
struct SharePayload {
    let extensionContext: NSExtensionContext?

    func resolve() async -> (url: String, title: String?)? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        // Safari puts the page title in attributedContentText; the server's
        // metadata extraction fills any gaps, same as a bare extension save.
        let title = items.compactMap { $0.attributedContentText?.string }
            .first { !$0.isEmpty }

        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
                       url.scheme?.hasPrefix("http") == true {
                        return (url.absoluteString, title)
                    }
                }
            }
        }
        // Fallback: plain text that is a URL (some apps share links as text).
        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
                       let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
                       url.scheme?.hasPrefix("http") == true {
                        return (url.absoluteString, title)
                    }
                }
            }
        }
        return nil
    }
}
