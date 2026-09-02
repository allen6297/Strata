import { parseCssColor, type DrawCmd, type RenderFrame } from '@/lib/render-frame'
import type { ImageCache } from '@/lib/render-canvas'

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 a_color;
uniform vec4 u_view;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 p = (a_pos - u_view.xy) * u_view.zw;
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, v_uv) * v_color;
}
`

const LINE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
uniform vec4 u_view;
void main() {
  vec2 p = (a_pos - u_view.xy) * u_view.zw;
  gl_Position = vec4(p, 0.0, 1.0);
}
`

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`

const FLOATS_PER_VERT = 8
const VERTS_PER_QUAD = 6
const QUAD_FLOATS = FLOATS_PER_VERT * VERTS_PER_QUAD

type GpuTex = {
  tex: WebGLTexture
  w: number
  h: number
  url: string
}

export type WebGlRenderer = {
  draw: (
    frame: RenderFrame,
    cache: ImageCache,
    cam: { x: number; y: number; zoom: number },
    cssW: number,
    cssH: number,
    grid?: { size: number; color: [number, number, number, number]; axis: [number, number, number, number] },
  ) => void
  resize: (cssW: number, cssH: number, dpr: number) => void
  destroy: () => void
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('webgl shader', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function makeWhite(gl: WebGL2RenderingContext): GpuTex | null {
  const tex = gl.createTexture()
  if (!tex) return null
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  )
  return { tex, w: 1, h: 1, url: '' }
}

function uploadImage(
  gl: WebGL2RenderingContext,
  img: HTMLImageElement,
  url: string,
  existing: WebGLTexture | null,
): GpuTex | null {
  const tex = existing ?? gl.createTexture()
  if (!tex) return null
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  return { tex, w: img.naturalWidth, h: img.naturalHeight, url }
}

function writeQuad(
  buf: Float32Array,
  o: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  // tri 0-1-2, 0-2-3
  const corners = [
    [x0, y0, u0, v0],
    [x1, y1, u1, v0],
    [x2, y2, u1, v1],
    [x0, y0, u0, v0],
    [x2, y2, u1, v1],
    [x3, y3, u0, v1],
  ]
  let i = o
  for (const [x, y, u, v] of corners) {
    buf[i++] = x
    buf[i++] = y
    buf[i++] = u
    buf[i++] = v
    buf[i++] = r
    buf[i++] = g
    buf[i++] = b
    buf[i++] = a
  }
}

function spriteCorners(cmd: Extract<DrawCmd, { kind: 'sprite' }>) {
  const hw = cmd.w / 2
  const hh = cmd.h / 2
  let x0 = -hw
  let y0 = -hh
  let x1 = hw
  let y1 = -hh
  let x2 = hw
  let y2 = hh
  let x3 = -hw
  let y3 = hh
  if (cmd.rotation) {
    const rad = (cmd.rotation * Math.PI) / 180
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    const rot = (x: number, y: number) => [x * c - y * s, x * s + y * c]
    ;[x0, y0] = rot(x0, y0)
    ;[x1, y1] = rot(x1, y1)
    ;[x2, y2] = rot(x2, y2)
    ;[x3, y3] = rot(x3, y3)
  }
  return [
    cmd.x + x0,
    cmd.y + y0,
    cmd.x + x1,
    cmd.y + y1,
    cmd.x + x2,
    cmd.y + y2,
    cmd.x + x3,
    cmd.y + y3,
  ] as const
}

export function createWebGlRenderer(
  canvas: HTMLCanvasElement,
): WebGlRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: true,
  })
  if (!gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('webgl program', gl.getProgramInfoLog(prog))
    return null
  }
  const uView = gl.getUniformLocation(prog, 'u_view')
  const uTex = gl.getUniformLocation(prog, 'u_tex')
  const vao = gl.createVertexArray()
  const vbo = gl.createBuffer()
  if (!vao || !vbo) return null
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  const stride = FLOATS_PER_VERT * 4
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16)
  gl.bindVertexArray(null)

  const lvs = compile(gl, gl.VERTEX_SHADER, LINE_VERT)
  const lfs = compile(gl, gl.FRAGMENT_SHADER, LINE_FRAG)
  if (!lvs || !lfs) return null
  const lineProg = gl.createProgram()
  if (!lineProg) return null
  gl.attachShader(lineProg, lvs)
  gl.attachShader(lineProg, lfs)
  gl.linkProgram(lineProg)
  if (!gl.getProgramParameter(lineProg, gl.LINK_STATUS)) return null
  const lineView = gl.getUniformLocation(lineProg, 'u_view')
  const lineColor = gl.getUniformLocation(lineProg, 'u_color')
  const lineVao = gl.createVertexArray()
  const lineVbo = gl.createBuffer()
  if (!lineVao || !lineVbo) return null
  gl.bindVertexArray(lineVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)
  gl.bindVertexArray(null)
  let lineData = new Float32Array(2048)

  const white = makeWhite(gl)
  if (!white) return null
  const gpu = new Map<string, GpuTex>()
  let data = new Float32Array(512 * QUAD_FLOATS)
  let quadCap = 512

  const texFor = (cmd: DrawCmd, cache: ImageCache): GpuTex => {
    const id = cmd.textureId
    if (!id) return white
    const hit = cache.get(id)
    const img = hit?.img
    if (!hit || !img || !img.complete || img.naturalWidth <= 0) return white
    const prev = gpu.get(id)
    if (prev && prev.url === hit.url && prev.w === img.naturalWidth) return prev
    const next = uploadImage(gl, img, hit.url, prev?.tex ?? null)
    if (!next) return white
    gpu.set(id, next)
    return next
  }

  const grow = (quads: number) => {
    if (quads <= quadCap) return
    while (quadCap < quads) quadCap *= 2
    data = new Float32Array(quadCap * QUAD_FLOATS)
  }

  const flush = (tex: GpuTex, quadCount: number) => {
    if (quadCount <= 0) return
    gl.bindTexture(gl.TEXTURE_2D, tex.tex)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      data.subarray(0, quadCount * QUAD_FLOATS),
      gl.STREAM_DRAW,
    )
    gl.drawArrays(gl.TRIANGLES, 0, quadCount * VERTS_PER_QUAD)
  }

  const pushCmd = (cmd: DrawCmd, tex: GpuTex, qi: number) => {
    const o = qi * QUAD_FLOATS
    if (cmd.kind === 'sprite') {
      const [r0, g0, b0, a] = cmd.textureId && tex !== white
        ? [1, 1, 1, 1]
        : parseCssColor(cmd.color)
      const r = r0 * a
      const g = g0 * a
      const b = b0 * a
      const [x0, y0, x1, y1, x2, y2, x3, y3] = spriteCorners(cmd)
      writeQuad(data, o, x0, y0, x1, y1, x2, y2, x3, y3, 0, 0, 1, 1, r, g, b, a)
      return
    }
    const ts = cmd.size
    const [r0, g0, b0, a] =
      cmd.textureId && tex !== white ? [1, 1, 1, 1] : parseCssColor(cmd.color)
    const r = r0 * a
    const g = g0 * a
    const b = b0 * a
    let u0 = 0
    let v0 = 0
    let u1 = 1
    let v1 = 1
    if (tex !== white && ts > 0 && tex.w > 0) {
      const cols = Math.max(1, Math.floor(tex.w / ts))
      const sx = (cmd.index % cols) * ts
      const sy = Math.floor(cmd.index / cols) * ts
      u0 = sx / tex.w
      v0 = sy / tex.h
      u1 = (sx + ts) / tex.w
      v1 = (sy + ts) / tex.h
    }
    writeQuad(
      data,
      o,
      cmd.x,
      cmd.y,
      cmd.x + ts,
      cmd.y,
      cmd.x + ts,
      cmd.y + ts,
      cmd.x,
      cmd.y + ts,
      u0,
      v0,
      u1,
      v1,
      r,
      g,
      b,
      a,
    )
  }

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(14 / 255, 16 / 255, 20 / 255, 1)

  return {
    resize(cssW, cssH, dpr) {
      const pw = Math.max(1, Math.floor(cssW * dpr))
      const ph = Math.max(1, Math.floor(cssH * dpr))
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
      }
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      gl.viewport(0, 0, pw, ph)
    },
    draw(frame, cache, cam, cssW, cssH, grid) {
      gl.clear(gl.COLOR_BUFFER_BIT)
      const zoomX = (cam.zoom * 2) / cssW
      const zoomY = (-cam.zoom * 2) / cssH
      const left = cam.x - cssW / 2 / cam.zoom
      const right = cam.x + cssW / 2 / cam.zoom
      const top = cam.y - cssH / 2 / cam.zoom
      const bottom = cam.y + cssH / 2 / cam.zoom

      if (grid && grid.size > 0) {
        const pts: number[] = []
        const startX = Math.floor(left / grid.size) * grid.size
        const startY = Math.floor(top / grid.size) * grid.size
        let n = 0
        for (let x = startX; x <= right && n < 512; x += grid.size, n++) {
          pts.push(x, top, x, bottom)
        }
        n = 0
        for (let y = startY; y <= bottom && n < 512; y += grid.size, n++) {
          pts.push(left, y, right, y)
        }
        if (pts.length > lineData.length) {
          lineData = new Float32Array(pts.length)
        }
        lineData.set(pts)
        gl.useProgram(lineProg)
        gl.uniform4f(lineView, cam.x, cam.y, zoomX, zoomY)
        gl.bindVertexArray(lineVao)
        gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          lineData.subarray(0, pts.length),
          gl.STREAM_DRAW,
        )
        gl.uniform4f(
          lineColor,
          grid.color[0],
          grid.color[1],
          grid.color[2],
          grid.color[3],
        )
        gl.drawArrays(gl.LINES, 0, pts.length / 2)
        const axes = new Float32Array([left, 0, right, 0, 0, top, 0, bottom])
        gl.bufferData(gl.ARRAY_BUFFER, axes, gl.STREAM_DRAW)
        gl.uniform4f(
          lineColor,
          grid.axis[0],
          grid.axis[1],
          grid.axis[2],
          grid.axis[3],
        )
        gl.drawArrays(gl.LINES, 0, 4)
        gl.bindVertexArray(null)
      }

      if (!frame.commands.length) return
      gl.useProgram(prog)
      gl.uniform4f(uView, cam.x, cam.y, zoomX, zoomY)
      gl.uniform1i(uTex, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
      grow(frame.commands.length)

      let batchTex: GpuTex | null = null
      let batchKey = ''
      let count = 0
      const flushBatch = () => {
        if (batchTex && count) flush(batchTex, count)
        count = 0
      }
      for (const cmd of frame.commands) {
        const tex = texFor(cmd, cache)
        const key = cmd.textureId && tex !== white ? cmd.textureId : ''
        if (batchTex && key !== batchKey) flushBatch()
        batchTex = tex
        batchKey = key
        pushCmd(cmd, tex, count)
        count += 1
      }
      flushBatch()
      gl.bindVertexArray(null)
    },
    destroy() {
      for (const t of gpu.values()) gl.deleteTexture(t.tex)
      gl.deleteTexture(white.tex)
      gl.deleteBuffer(vbo)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(lineVbo)
      gl.deleteVertexArray(lineVao)
      gl.deleteProgram(lineProg)
      gl.deleteShader(lvs)
      gl.deleteShader(lfs)
    },
  }
}
