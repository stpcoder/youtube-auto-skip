# YouTube Auto Skip + Adblock

**Bloqueio de anúncios para Chrome, com proteção dedicada ao YouTube.**

Extensão de código aberto em Manifest V3. Combina filtros para anúncios e pop-ups com prevenção de anúncios no player do YouTube, pulo automático e uma tentativa limitada de recuperar o início da reprodução.

[English](docs/README.en.md) · [Bahasa Indonesia](docs/README.id.md) · [한국어](docs/README.ko.md)

[Baixar versão de teste](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.0-preview.1) · [Relatar um problema](https://github.com/stpcoder/youtube-auto-skip/issues/new/choose)

![Configurações em português durante a visualização local de teste](docs/assets/popup.pt-BR.png)

## O que faz

- Bloqueia solicitações de anúncios e oculta elementos publicitários com filtros incluídos na instalação.
- Intercepta pop-ups destinados a servidores de anúncios conhecidos. Oferece controle do bloqueio geral e exceções por site.
- Remove campos de anúncios de respostas conhecidas do player do YouTube e usa pulo automático como alternativa.
- Tenta recuperar uma espera inicial com buffer vazio, preservando a posição de início do vídeo.

**Versão de teste: 3.0.0.** O resultado varia conforme o site, o anúncio e as mudanças do YouTube. Não há garantia de bloquear todos os anúncios ou eliminar toda espera. O bloqueio geral não reproduz o motor completo do uBlock Origin ou do AdGuard.

O filtro do aviso de interrupção reconhece atualmente a mensagem coreana do YouTube. A tradução da extensão não amplia esse filtro para mensagens em português.

## Instalar no Chrome

1. Baixe o ZIP na [página da versão](https://github.com/stpcoder/youtube-auto-skip/releases/tag/v3.0.0-preview.1) e extraia a pasta `youtube-auto-skip`.
2. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta extraída que contém `manifest.json`.
4. Confirme a versão **3.0.0** e recarregue as páginas abertas, incluindo o YouTube.
5. Clique no ícone da extensão para ajustar o bloqueio geral ou liberar o site atual.

Requer **Chrome 111 ou mais recente no computador**. A extensão ainda não está na Chrome Web Store. Este pacote não oferece suporte validado a Firefox, Safari, iPhone ou ao aplicativo do YouTube.

O controle do bloqueio geral **não desativa** a proteção dedicada ao YouTube. Para interromper todas as funções, desative a extensão em `chrome://extensions`. Para atualizar, extraia o novo pacote, clique em **Recarregar** na extensão e recarregue as páginas.

## Permissões e dados

O acesso a sites HTTP/HTTPS permite aplicar filtros e ocultar anúncios. `storage` guarda preferências e exceções localmente; `scripting` aplica estilos; `declarativeNetRequest` filtra solicitações; `webNavigation` identifica novas janelas de anúncios. A permissão `debugger` é usada apenas como alternativa de clique no botão de pular anúncios do YouTube e pode exibir um aviso do Chrome.

O código desta versão não envia telemetria ao mantenedor. As preferências ficam no navegador. Os filtros são incluídos no pacote e só são atualizados ao instalar outra versão; o comando de desenvolvimento para reconstruí-los acessa as fontes originais.

## Filtros e cobertura

O pacote inclui **29.893 regras de rede** e **30.236 entradas de filtros visuais**, geradas a partir de EasyList e YousList. O número de regras não representa taxa de sucesso: a seleção depende do site e de suporte do navegador. A conversão omite regras não suportadas e registra seus limites em [`filters/provenance.json`](filters/provenance.json).

YousList complementa sites coreanos. Esta versão ainda não inclui EasyList Portuguese ou ABPindo e não foi validada como um bloqueador específico para sites brasileiros ou indonésios. Veja as [fontes e licenças](THIRD_PARTY_NOTICES.md).

## Desenvolvimento

```sh
git clone https://github.com/stpcoder/youtube-auto-skip.git
cd youtube-auto-skip
npm ci
npm test
npm run check:package
npm run build:release
```

Use Node.js 22 ou mais recente. Os filtros já estão incluídos; não é preciso reconstruí-los para instalar. `npm run build:filters -- --offline` usa as fontes salvas. `npm run build:filters` baixa versões novas e pode alterar a cobertura e o número de regras.

Os testes automatizados verificam cenários simulados e a integridade do pacote. Eles não comprovam bloqueio universal de anúncios no YouTube. Veja a [arquitetura e os limites de validação](docs/TECHNICAL.md) e o [guia de contribuição](CONTRIBUTING.md).

## Contribuir

Se encontrar um anúncio ou uma página quebrada, abra um [relato reproduzível](https://github.com/stpcoder/youtube-auto-skip/issues/new/choose) com versão do Chrome, versão da extensão, passos e resultado esperado. Remova dados pessoais das imagens. Relatos em português, inglês, indonésio e coreano são bem-vindos.

Código do projeto: [GPL-3.0-only](LICENSE). Os filtros mantêm as licenças e atribuições indicadas em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Projeto independente, sem vínculo com YouTube ou Google.
