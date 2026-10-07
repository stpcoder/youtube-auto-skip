# Launch drafts

These are editable drafts. No community posts or messages have been sent. Pair a draft with an actual installed-package demo before making performance claims.

## Português — apresentação técnica

**Título:** Publiquei uma extensão Chrome MV3 para bloquear anúncios e tratar anúncios do YouTube

Estou desenvolvendo uma extensão de código aberto que combina filtros de anúncios e pop-ups com um caminho dedicado para o player do YouTube. Publiquei uma versão de teste com guia e configurações em português.

O bloqueio geral usa regras declarativas geradas a partir de EasyList e YousList. No YouTube, o código remove campos de anúncios de respostas conhecidas e usa pulo automático e clique como alternativas. Também tenta recuperar um início com buffer vazio, com um limite de tentativas e preservando a posição inicial.

Um ponto que aprendi: remover os dados de anúncio no cliente e observar a reprodução começar são coisas diferentes. Por isso, os testes simulados, tentativas de API e observações reais precisam ser registrados separadamente. Outro cuidado é tratar o fechamento da aba como cancelamento, para não deixar cliques antigos na fila.

A versão é experimental: não promete bloquear todos os anúncios, não implementa todo o motor de filtros e ainda não inclui EasyList Portuguese. A permissão `debugger` é usada como alternativa no botão de pular anúncios do YouTube; os detalhes estão no README.

Gostaria de feedback sobre instalação, páginas quebradas e situações em que um anúncio permanece. Um relato com a versão do Chrome, versão da extensão e passos ajuda a reproduzir o problema.

Código, testes e ZIP: [stpcoder/youtube-auto-skip](https://github.com/stpcoder/youtube-auto-skip).

## Português — publicação curta

Publiquei uma versão de teste do YouTube Auto Skip + Adblock: extensão Chrome MV3 com filtros de anúncios/pop-ups e tratamento dedicado dos anúncios do YouTube. Guia e configurações em português, código aberto e limitações documentadas. Procuro feedback de instalação e bugs reproduzíveis: https://github.com/stpcoder/youtube-auto-skip

## Bahasa Indonesia — pengenalan singkat

Saya merilis versi pratinjau YouTube Auto Skip + Adblock, ekstensi Chrome Manifest V3 untuk memblokir iklan umum dan pop-up, dengan penanganan khusus untuk iklan pada pemutar YouTube.

Panduan pemasangan dan pengaturan tersedia dalam bahasa Indonesia. Kode, pengujian, sumber filter, dan batasannya terbuka. Versi ini tidak menjamin semua iklan terblokir dan belum menyertakan ABPindo. Izin `debugger` digunakan sebagai cadangan untuk tombol lewati iklan YouTube.

Saya mencari masukan tentang proses pemasangan, halaman yang terganggu, atau iklan yang masih muncul. Mohon sertakan versi Chrome, versi ekstensi, dan langkah reproduksi.

Repositori dan ZIP: [stpcoder/youtube-auto-skip](https://github.com/stpcoder/youtube-auto-skip).
