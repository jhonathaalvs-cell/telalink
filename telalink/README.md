# TelaLink

MVP de compartilhamento de tela em tempo real, usando **WebRTC** para o vídeo e **Socket.IO** para a sinalização entre dispositivos.

## O que está incluído

- Criar uma sala com código curto.
- Compartilhar o link da sala ou copiar o código.
- Entrar como espectador usando um código.
- Transmitir para mais de um espectador (cada espectador recebe uma conexão WebRTC própria).
- Interface responsiva para computador e celular.
- Encerrar a transmissão a qualquer momento.

## Requisitos

- Node.js 18 ou superior.
- Navegador moderno.
- Para transmitir a tela em produção, publique o site por **HTTPS**. O navegador só libera a API de captura em contexto seguro (HTTPS ou `localhost`).

## Como executar localmente

1. Extraia o ZIP e abra a pasta `telalink` no terminal.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Inicie o servidor:

   ```bash
   npm start
   ```

4. Abra [http://localhost:3000](http://localhost:3000).
5. Em um computador compatível, clique em **Iniciar transmissão** e escolha a tela, janela ou aba que deseja compartilhar.
6. Copie o link ou o código da sala para o outro dispositivo.

Para encerrar, clique em **Parar transmissão**.

## Publicar na internet

Publique a pasta em uma plataforma que execute aplicações Node.js (por exemplo, Render, Railway ou um VPS), com o comando de inicialização `npm start`. A plataforma deve disponibilizar HTTPS e encaminhar a porta definida pela variável de ambiente `PORT`.

Se for hospedar em um servidor próprio, configure HTTPS com um certificado válido. Não exponha o servidor diretamente à internet sem HTTPS.

## Limitações conhecidas

- **Transmitir a tela de um celular pelo navegador:** o suporte à API `getDisplayMedia()` é limitado e varia por sistema e navegador. Atualmente, navegadores móveis populares podem não oferecer essa API. O projeto permite assistir pelo celular; para transmitir a tela de um Android de forma confiável, o caminho indicado é criar um app Android nativo usando a API de captura de tela do sistema (MediaProjection) e conectá-lo à sinalização/WebRTC.
- O áudio do sistema é opcional e depende do navegador, do sistema operacional e da fonte escolhida.
- A configuração WebRTC usa um servidor STUN público para ajudar a estabelecer conexões. Redes restritivas podem exigir um servidor TURN; sem TURN, algumas conexões entre redes diferentes podem falhar.
- Qualquer pessoa que tenha o código/link pode tentar entrar. Não há senha, fila de espera, autenticação nem moderação nesta versão.
- Esta é uma base funcional para desenvolvimento e testes, não uma solução empresarial endurecida para produção.

## Segurança e privacidade

A tela só começa a ser capturada após a ação explícita do usuário e a permissão do navegador. O vídeo usa WebRTC ponto a ponto quando a rede permite. O servidor coordena a conexão, mas este MVP não possui login nem controles de acesso adicionais; compartilhe o link apenas com pessoas autorizadas.

## Estrutura

```text
telalink/
├── public/
│   ├── client.js
│   ├── index.html
│   └── styles.css
├── package.json
├── server.js
└── README.md
```
