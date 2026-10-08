import UIKit
import WebKit

// Standalone-app adapter only. Other apps embed FocusSetupViewController directly.
class ViewController: UIViewController {
    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.removeFromSuperview()
        let setup = FocusSetupViewController()
        addChild(setup)
        setup.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(setup.view)
        NSLayoutConstraint.activate([
            setup.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            setup.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            setup.view.topAnchor.constraint(equalTo: view.topAnchor),
            setup.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        setup.didMove(toParent: self)
    }
}
