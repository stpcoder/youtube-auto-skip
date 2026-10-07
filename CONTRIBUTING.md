# Contribuir / Contributing

Relatos em português, inglês, indonésio e coreano são bem-vindos. Use os [modelos de issue](https://github.com/stpcoder/youtube-auto-skip/issues/new/choose), informe as versões e descreva passos que outra pessoa consiga repetir. Remova nomes de conta, tokens, cookies e informações pessoais antes de enviar imagens ou logs.

Para desenvolver, use Node.js 22+, execute `npm ci`, `npm run verify`. `npm run build:release` cria os ZIPs Chrome/Safari e checksums. Os filtros incluídos permitem instalar a extensão sem executar um build online. Mudanças nas fontes de filtros devem atualizar `filters/provenance.json`, os dados gerados e as atribuições.

As traduções ficam em `_locales/{en,pt_BR,id,ko}/messages.json`. Preserve todas as chaves e substituições `$1`. O README principal é em português brasileiro; os guias de instalação traduzidos ficam em `docs/README.*.md`. Mantenha as versões, permissões e limitações consistentes entre os idiomas.

Separe resultados de testes simulados de observações no YouTube real. Uma tentativa de pular ou recarregar não prova que o anúncio terminou ou que o vídeo começou. Testes relevantes devem preservar vídeo normal, posição de início, navegação e cancelamento de cliques.

English: use Node.js 22+, run `npm ci`, `npm run verify` and `npm run build:release`. Preserve locale placeholders, filter attribution and playback behavior. Include reproducible steps and distinguish simulated checks from live YouTube observations. Contributions are made under the licenses applicable to the affected files.

For browser checks: `npx playwright install chromium`, then `npm run test:browser`. Use disposable local fixtures; preserve working installs by keeping their folder paths. Rebuild general bundles after changing component sources. Safari source validation is separate from iPhone signing and real-device playback.
