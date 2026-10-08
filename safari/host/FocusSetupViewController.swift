import UIKit

/// Optional onboarding. Safari works independently once its extension is enabled.
/// This controller never requests permissions, changes Safari settings, or downloads code.
public final class FocusSetupViewController: UIViewController {
    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        overrideUserInterfaceStyle = .light
        let scroll = UIScrollView()
        let stack = UIStackView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.alignment = .fill
        stack.spacing = 28
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 28),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -32),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
        ])
        #if SWIFT_PACKAGE
        let resources = Bundle.module
        #else
        let resources = Bundle(for: FocusSetupViewController.self)
        #endif
        let icon = UIImageView(image: UIImage(named: "focus-icon", in: resources, compatibleWith: nil))
        icon.contentMode = .scaleAspectFit
        icon.isAccessibilityElement = false
        NSLayoutConstraint.activate([icon.widthAnchor.constraint(equalToConstant: 64), icon.heightAnchor.constraint(equalToConstant: 64)])
        let header = UIStackView(arrangedSubviews: [icon, label("Focus", style: .largeTitle, bold: true)])
        header.alignment = .center
        header.spacing = 12
        stack.addArrangedSubview(header)
        stack.addArrangedSubview(label("Safari에서 시작하기", style: .title2, bold: true))
        stack.addArrangedSubview(step("1. Safari 설정", text: "설정 → 앱 → Safari → 확장 프로그램에서 Focus를 켜세요."))
        stack.addArrangedSubview(step("2. YouTube 접속", text: "Safari에서 YouTube를 열고 확장 접근 요청을 허용하세요. 모든 사이트에 쓰려면 ‘모든 웹사이트에서 항상 허용’을 선택하세요."))
        stack.addArrangedSubview(step("접근 요청이 안 보이면", text: "Safari 페이지 메뉴에서 Focus를 누르고 접근을 허용한 뒤 새로고침하세요."))
    }

    private func label(_ text: String, style: UIFont.TextStyle, bold: Bool = false) -> UILabel {
        let result = UILabel()
        result.text = text
        result.textColor = .black
        result.numberOfLines = 0
        result.adjustsFontForContentSizeCategory = true
        let font = UIFont.preferredFont(forTextStyle: style)
        result.font = bold ? UIFont(descriptor: font.fontDescriptor.withSymbolicTraits(.traitBold) ?? font.fontDescriptor, size: 0) : font
        return result
    }

    private func step(_ title: String, text: String) -> UIStackView {
        let result = UIStackView(arrangedSubviews: [label(title, style: .headline, bold: true), label(text, style: .body)])
        result.axis = .vertical
        result.spacing = 10
        return result
    }
}
