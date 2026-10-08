import SafariServices

/// Add this source to the containing app's Safari Web Extension target.
/// Focus does not need native message commands or a remote-code installer.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
