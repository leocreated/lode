// Gold dust: WebGL point-sprite drift. Motes rise through lamplight,
// catch a glint, and fade. Parallax follows the mouse.
(() => {
  const canvas = document.getElementById('dust');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false });
  if (!gl) return;

  const N = 260;
  const vsrc = `
    attribute vec4 a; // x, y, size, phase
    uniform float t; uniform vec2 res; uniform vec2 mouse;
    varying float glow;
    void main() {
      float phase = a.w;
      float y = mod(a.y + t * (0.012 + 0.02 * fract(phase * 7.13)), 1.2) - 0.1;
      float x = a.x + sin(t * 0.4 + phase * 6.28) * 0.012 + mouse.x * (0.01 + a.z * 0.02);
      float yy = y + mouse.y * (0.008 + a.z * 0.015);
      glow = 0.35 + 0.65 * pow(abs(sin(t * (0.5 + fract(phase * 3.7)) + phase * 40.0)), 6.0);
      glow *= smoothstep(0.0, 0.08, y) * smoothstep(1.1, 0.9, y);
      gl_Position = vec4(x * 2.0 - 1.0, yy * 2.0 - 1.0, 0.0, 1.0);
      gl_PointSize = (a.z * 3.2 + 1.0) * (res.y / 900.0) * (0.7 + glow);
    }`;
  const fsrc = `
    precision mediump float; varying float glow;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      float alpha = smoothstep(0.5, 0.05, r) * glow * 0.55;
      vec3 gold = mix(vec3(0.05, 0.42, 0.37), vec3(0.44, 1.0, 0.92), glow);
      gl_FragColor = vec4(gold, alpha);
    }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vsrc));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(prog); gl.useProgram(prog);

  const data = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    data[i * 4] = Math.random();
    data[i * 4 + 1] = Math.random();
    data[i * 4 + 2] = Math.pow(Math.random(), 2.2);
    data[i * 4 + 3] = Math.random();
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);

  const uT = gl.getUniformLocation(prog, 't');
  const uRes = gl.getUniformLocation(prog, 'res');
  const uMouse = gl.getUniformLocation(prog, 'mouse');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  let mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('mousemove', e => {
    tmx = (e.clientX / innerWidth - 0.5);
    tmy = -(e.clientY / innerHeight - 0.5);
  });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  addEventListener('resize', resize); resize();

  function frame(ms) {
    mx += (tmx - mx) * 0.03; my += (tmy - my) * 0.03;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uT, ms / 1000);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.POINTS, 0, N);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
