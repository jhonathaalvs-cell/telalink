(() => {
  const $ = (id) => document.getElementById(id);
  const landing = $('landing');
  const session = $('session');
  const startBroadcastBtn = $('startBroadcastBtn');
  const joinForm = $('joinForm');
  const roomCodeInput = $('roomCodeInput');
  const roomCodeDisplay = $('roomCodeDisplay');
  const remoteVideo = $('remoteVideo');
  const localVideo = $('localVideo');
  const emptyStage = $('emptyStage');
  const emptyTitle = $('emptyTitle');
  const emptyDescription = $('emptyDescription');
  const sourceControls = $('sourceControls');
  const sessionStatusText = $('sessionStatusText');
  const sessionMessage = $('sessionMessage');
  const selfRole = $('selfRole');
  const selfAvatar = $('selfAvatar');
  const screenFrameLabel = $('screenFrameLabel');
  const participantCount = $('participantCount');
  const copyFeedback = $('copyFeedback');
  const toast = $('toast');

  let role = null;
  let roomId = null;
  let displayStream = null;
  let toastTimer = null;
  const peerConnections = new Map();
  const pendingCandidates = new Map();
  const socket = io();

  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  function generateRoomId() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }

  function normalizeRoomId(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function setSessionStatus(message, live = false) {
    sessionStatusText.textContent = message;
    $('liveDot').style.background = live ? '#5fe1b1' : '#edc16b';
    $('liveDot').style.boxShadow = live ? '0 0 0 4px rgba(95,225,177,.09)' : '0 0 0 4px rgba(237,193,107,.09)';
  }

  function openSession() {
    landing.classList.add('hidden');
    session.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function returnHome({ tellServer = true } = {}) {
    if (tellServer && socket.connected) {
      socket.emit(role === 'broadcaster' ? 'stop-broadcast' : 'leave-room');
    }
    closeAllPeers();
    stopLocalStream();
    role = null;
    roomId = null;
    session.classList.add('hidden');
    landing.classList.remove('hidden');
    remoteVideo.classList.add('hidden');
    localVideo.classList.add('hidden');
    emptyStage.classList.remove('hidden');
    sourceControls.classList.add('hidden');
    $('copyFeedback').textContent = '';
    sessionMessage.textContent = '';
    history.replaceState({}, '', window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function stopLocalStream() {
    if (displayStream) {
      displayStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }
    displayStream = null;
    localVideo.srcObject = null;
  }

  function closeAllPeers() {
    for (const pc of peerConnections.values()) pc.close();
    peerConnections.clear();
    pendingCandidates.clear();
    remoteVideo.srcObject = null;
  }

  function updateViewerCount() {
    const count = (role === 'broadcaster' ? 1 : 0) + peerConnections.size;
    participantCount.textContent = String(Math.max(1, count));
  }

  function currentRoomLink() {
    return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
  }

  function setupSession(roleName) {
    openSession();
    roomCodeDisplay.textContent = roomId;
    $('selfName').textContent = 'Você';
    selfAvatar.textContent = roleName === 'broadcaster' ? 'T' : 'A';
    if (roleName === 'broadcaster') {
      selfRole.textContent = 'Transmitindo';
      screenFrameLabel.textContent = 'SUA TELA COMPARTILHADA';
      sourceControls.classList.remove('hidden');
      localVideo.classList.remove('hidden');
      remoteVideo.classList.add('hidden');
      emptyStage.classList.add('hidden');
      localVideo.srcObject = displayStream;
      setSessionStatus('Você está ao vivo', true);
      sessionMessage.textContent = 'Compartilhe o link ou o código para alguém assistir.';
    } else {
      selfRole.textContent = 'Assistindo';
      screenFrameLabel.textContent = 'TELA COMPARTILHADA';
      sourceControls.classList.add('hidden');
      localVideo.classList.add('hidden');
      remoteVideo.classList.add('hidden');
      emptyStage.classList.remove('hidden');
      emptyTitle.textContent = 'Aguardando transmissão';
      emptyDescription.textContent = 'Assim que a pessoa iniciar o compartilhamento, a tela aparecerá aqui.';
      setSessionStatus('Conectado à sala', false);
      sessionMessage.textContent = 'Você entrou na sala. A transmissão aparecerá assim que estiver disponível.';
    }
    updateViewerCount();
  }

  async function startBroadcast() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      showToast('Este navegador não permite transmitir a tela. Tente em um computador com Chrome, Edge, Firefox ou Safari compatível.');
      return;
    }
    if (!window.isSecureContext) {
      showToast('A transmissão exige HTTPS ou localhost. Abra o site por uma conexão segura.');
      return;
    }
    startBroadcastBtn.disabled = true;
    startBroadcastBtn.innerHTML = '<span>Solicitando permissão...</span>';
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: true
      });
      displayStream = stream;
      roomId = generateRoomId();
      role = 'broadcaster';
      setupSession('broadcaster');
      history.replaceState({}, '', `${window.location.pathname}?room=${encodeURIComponent(roomId)}`);
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (role === 'broadcaster') stopBroadcast();
      }, { once: true });
      socket.emit('join-room', { roomId, role });
    } catch (error) {
      if (error && error.name === 'NotAllowedError') showToast('Compartilhamento cancelado. Autorize a captura da tela para continuar.');
      else showToast('Não foi possível iniciar a transmissão neste navegador.');
      console.warn('Falha ao iniciar captura de tela:', error);
    } finally {
      startBroadcastBtn.disabled = false;
      startBroadcastBtn.innerHTML = '<span>Iniciar transmissão</span><span class="button-arrow">↗</span>';
    }
  }

  function joinRoom(code) {
    const cleaned = normalizeRoomId(code);
    if (cleaned.length < 4) {
      showToast('Digite um código de sala válido.');
      roomCodeInput.focus();
      return;
    }
    if (!socket.connected) {
      showToast('Conectando ao servidor. Tente novamente em instantes.');
      return;
    }
    roomId = cleaned;
    role = 'viewer';
    setupSession('viewer');
    history.replaceState({}, '', `${window.location.pathname}?room=${encodeURIComponent(roomId)}`);
    socket.emit('join-room', { roomId, role });
  }

  async function createBroadcasterPeer(viewerId) {
    if (role !== 'broadcaster' || !displayStream || peerConnections.has(viewerId)) return;
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(viewerId, pc);
    pendingCandidates.set(viewerId, []);
    displayStream.getTracks().forEach((track) => pc.addTrack(track, displayStream));
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('signal', { roomId, target: viewerId, payload: { candidate: event.candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setSessionStatus('Transmissão conectada', true);
        sessionMessage.textContent = 'Um espectador está conectado à sua transmissão.';
      } else if (['failed', 'disconnected'].includes(pc.connectionState)) {
        sessionMessage.textContent = 'A conexão com um espectador foi interrompida.';
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { roomId, target: viewerId, payload: { description: pc.localDescription } });
      updateViewerCount();
    } catch (error) {
      console.error('Não foi possível iniciar conexão com espectador:', error);
      pc.close();
      peerConnections.delete(viewerId);
      pendingCandidates.delete(viewerId);
      updateViewerCount();
    }
  }

  function createViewerPeer(broadcasterId) {
    if (role !== 'viewer' || peerConnections.has(broadcasterId)) return;
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(broadcasterId, pc);
    pendingCandidates.set(broadcasterId, []);
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) remoteVideo.srcObject = stream;
      else {
        const tracks = remoteVideo.srcObject instanceof MediaStream ? remoteVideo.srcObject : new MediaStream();
        tracks.addTrack(event.track);
        remoteVideo.srcObject = tracks;
      }
      remoteVideo.classList.remove('hidden');
      emptyStage.classList.add('hidden');
      setSessionStatus('Assistindo ao vivo', true);
      sessionMessage.textContent = 'Você está recebendo a transmissão em tempo real.';
      remoteVideo.play().catch(() => {});
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('signal', { roomId, target: broadcasterId, payload: { candidate: event.candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setSessionStatus('Falha na conexão', false);
        sessionMessage.textContent = 'Não foi possível conectar. Verifique a rede e tente entrar novamente.';
      }
    };
    updateViewerCount();
  }

  async function flushCandidates(peerId, pc) {
    const queued = pendingCandidates.get(peerId) || [];
    pendingCandidates.set(peerId, []);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); }
      catch (error) { console.warn('Candidato ICE ignorado:', error); }
    }
  }

  async function handleSignal({ from, payload }) {
    if (!payload || !from) return;
    let pc = peerConnections.get(from);

    if (payload.description && role === 'viewer' && payload.description.type === 'offer') {
      if (!pc) {
        createViewerPeer(from);
        pc = peerConnections.get(from);
      }
    }
    if (!pc) return;

    try {
      if (payload.description) {
        await pc.setRemoteDescription(payload.description);
        await flushCandidates(from, pc);
        if (payload.description.type === 'offer' && role === 'viewer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { roomId, target: from, payload: { description: pc.localDescription } });
        }
      } else if (payload.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(payload.candidate);
        } else {
          const queue = pendingCandidates.get(from) || [];
          queue.push(payload.candidate);
          pendingCandidates.set(from, queue);
        }
      }
    } catch (error) {
      console.warn('Falha ao processar sinal WebRTC:', error);
    }
  }

  function stopBroadcast() {
    if (role !== 'broadcaster') return;
    returnHome({ tellServer: true });
    showToast('Transmissão encerrada.');
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      copyFeedback.textContent = successMessage;
      showToast(successMessage);
    } catch (_error) {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      const copied = document.execCommand('copy');
      temporary.remove();
      const message = copied ? successMessage : 'Não foi possível copiar automaticamente.';
      copyFeedback.textContent = message;
      showToast(message);
    }
  }

  startBroadcastBtn.addEventListener('click', startBroadcast);
  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    joinRoom(roomCodeInput.value);
  });
  roomCodeInput.addEventListener('input', () => {
    const start = roomCodeInput.selectionStart;
    roomCodeInput.value = normalizeRoomId(roomCodeInput.value);
    try { roomCodeInput.setSelectionRange(start, start); } catch (_error) {}
  });
  $('stopBroadcastBtn').addEventListener('click', stopBroadcast);
  $('backBtn').addEventListener('click', () => {
    returnHome({ tellServer: true });
    showToast('Você saiu da sala.');
  });
  $('copyCodeBtn').addEventListener('click', () => copyText(roomId || '', 'Código copiado!'));
  $('copyLinkBtn').addEventListener('click', () => copyText(currentRoomLink(), 'Link da sala copiado!'));

  socket.on('connect', () => {
    const queryRoom = new URLSearchParams(window.location.search).get('room');
    if (!role && queryRoom) {
      roomCodeInput.value = normalizeRoomId(queryRoom);
      joinRoom(queryRoom);
    }
  });

  socket.on('room-joined', ({ roomId: confirmedRoom, role: confirmedRole, isLive }) => {
    if (confirmedRoom !== roomId || confirmedRole !== role) return;
    setSessionStatus(role === 'broadcaster' ? 'Você está ao vivo' : (isLive ? 'Conectando à transmissão' : 'Aguardando transmissão'), role === 'broadcaster');
  });

  socket.on('room-error', ({ message }) => {
    showToast(message || 'Não foi possível entrar na sala.');
    sessionMessage.textContent = message || 'Não foi possível entrar na sala.';
    if (role === 'broadcaster') {
      returnHome({ tellServer: false });
    }
  });

  socket.on('viewer-joined', ({ viewerId }) => {
    if (role === 'broadcaster' && viewerId) createBroadcasterPeer(viewerId);
  });

  socket.on('broadcaster-available', ({ broadcasterId }) => {
    if (role === 'viewer' && broadcasterId) {
      setSessionStatus('Transmissão encontrada', false);
      sessionMessage.textContent = 'Conectando à tela compartilhada...';
      createViewerPeer(broadcasterId);
    }
  });

  socket.on('signal', handleSignal);

  socket.on('viewer-left', ({ viewerId }) => {
    const pc = peerConnections.get(viewerId);
    if (pc) pc.close();
    peerConnections.delete(viewerId);
    pendingCandidates.delete(viewerId);
    updateViewerCount();
  });

  socket.on('broadcast-stopped', () => {
    if (role !== 'viewer') return;
    closeAllPeers();
    remoteVideo.classList.add('hidden');
    remoteVideo.srcObject = null;
    emptyStage.classList.remove('hidden');
    emptyTitle.textContent = 'Transmissão encerrada';
    emptyDescription.textContent = 'A pessoa parou de compartilhar a tela. Você pode continuar nesta sala caso ela volte a transmitir.';
    setSessionStatus('Transmissão encerrada', false);
    sessionMessage.textContent = 'Aguardando uma nova transmissão nesta sala.';
  });

  socket.on('disconnect', () => {
    if (role) {
      setSessionStatus('Conexão com servidor perdida', false);
      sessionMessage.textContent = 'A conexão de sinalização foi interrompida. Recarregue a página se ela não voltar.';
    }
  });

  socket.on('connect_error', () => {
    if (!session.classList.contains('hidden')) {
      setSessionStatus('Falha no servidor', false);
      sessionMessage.textContent = 'Não foi possível conectar ao servidor TelaLink.';
    }
  });
})();
