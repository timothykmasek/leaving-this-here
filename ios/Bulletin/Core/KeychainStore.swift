import Foundation
import Security

// Keychain-backed storage for the session, shared app↔extension through the
// App Group used as the keychain access group (supported for app groups —
// no team-prefixed keychain-access-groups entitlement needed, which matters
// while the project has no signing team yet). Replaces App Group
// UserDefaults, which stores tokens as a plaintext plist on disk.
enum KeychainStore {
    private static func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.yourbulletin.ios.session",
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: Config.appGroup,
        ]
    }

    static func data(forKey key: String) -> Data? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        guard status == errSecSuccess else { return nil }
        return out as? Data
    }

    static func set(_ data: Data, forKey key: String) {
        var add = query(key)
        add[kSecValueData as String] = data
        // The share extension reads the session while the phone is unlocked;
        // AfterFirstUnlock also survives background refreshes later.
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecDuplicateItem {
            SecItemUpdate(query(key) as CFDictionary,
                          [kSecValueData as String: data] as CFDictionary)
        }
    }

    static func remove(forKey key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}
