const btn = document.getElementById('matter') as HTMLButtonElement;
const input = document.getElementById('src') as HTMLInputElement;
const status = document.getElementById('status') as HTMLDivElement;

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

socket.onopen = () => {
  status.innerText = 'Connected, waiting for ready...';
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'status') {
    if (data.status === 'ready') {
      btn.disabled = false;
      status.innerText = 'Ready';
    } else if (data.status === 'started') {
      status.innerText = `Processing ${data.src}...`;
    } else if (data.status === 'done') {
      status.innerText = `Successfully completed: ${data.src}`;
    } else if (data.status === 'error') {
      status.innerText = `Error processing ${data.src}: ${data.error}`;
    }
  }
};

socket.onclose = () => {
  btn.disabled = true;
  status.innerText = 'Disconnected from server';
};

btn.onclick = () => {
  const src = input.value;
  socket.send(JSON.stringify({ type: 'matter', src }));
};
