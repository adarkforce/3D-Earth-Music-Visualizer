import "./style.css";
import * as THREE from "three";
import { Mesh, MeshStandardMaterial, SphereBufferGeometry } from "three";
import * as dat from "dat.gui";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

function isOnMobile() {
  if (
    navigator.userAgent.match(/Android/i) !== null ||
    navigator.userAgent.match(/webOS/i) !== null ||
    navigator.userAgent.match(/iPhone/i) !== null ||
    navigator.userAgent.match(/iPad/i) !== null ||
    navigator.userAgent.match(/iPod/i) !== null ||
    navigator.userAgent.match(/BlackBerry/i) !== null ||
    navigator.userAgent.match(/Windows Phone/i) !== null
  ) {
    return true;
  }
  return false;
}

/**
 * File Input
 */

const overlay = document.querySelector(".upload");
overlay.style.pointerEvents = "none";

if (isOnMobile()) {
  let message = document.querySelector("#messageText");
  message.innerHTML = "Click on the screen and choose a bass HEAVY song...";
  overlay.style.pointerEvents = "all";
  overlay.onclick = (ev) => {
    let fI = document.querySelector("#fileInput");
    fI.onchange = (ev) => {
      let file = ev.target.files[0];
      if (!file.type.startsWith("audio")) return;
      audio.src = window.URL.createObjectURL(file);
      audio.load();
    };
    fI.click();
  };
}
/**
 * Audio Analyzer
 */
let source = null;

let audioCtx = null;
let analyser = null;
let dataArray = null;
let bufferLength = 0;

function createAudioContext() {
  if (source) {
    source.disconnect();
    source = null;
  }
  audioCtx = new (window.webkitAudioContext || window.AudioContext || false)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;

  bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
}

const audio = document.querySelector("#audioPlayer");

document.ondragover = (ev) => {
  ev.preventDefault();
};

document.onclick = () => {
  let el = document.getElementsByClassName("text");
  if (!el) return;
  for (let item of el) item.style.display = "none";
  if (audioCtx === null) createAudioContext();
};

document.ondrop = async (ev) => {
  ev.preventDefault();
  let file = null;
  if (ev.dataTransfer && ev.dataTransfer.items) {
    file = ev.dataTransfer.items[0].getAsFile();
  } else {
    file = ev.dataTransfer.files[0];
  }
  if (!file.type.startsWith("audio")) return;
  audio.src = window.URL.createObjectURL(file);
  audio.load();
};

let canPlay = false;
audio.addEventListener("canplaythrough", (event) => {
  if (!canPlay) {
    const playEl = document.querySelector(".play");
    if (!playEl) return;
    playEl.style.display = "flex";
    canPlay = true;
  }
});

/**
 * Loaders
 */

const textureLoader = new THREE.TextureLoader();

const earthTextureBump = textureLoader.load("/textures/earth/earth-bump.jpg");
earthTextureBump.minFilter = THREE.LinearFilter;
earthTextureBump.magFilter = THREE.LinearFilter;

const earthTextureLights = textureLoader.load(
  "/textures/earth/earth-lights.jpg"
);
const earthWaterMap = textureLoader.load("/textures/earth/water-map.jpg");
const earthTerrainMap = textureLoader.load("/textures/earth/earth-map.png");
const earthCloudMap = textureLoader.load("/textures/earth/earth-cloud-map.jpg");
const earthColorMap = textureLoader.load("/textures/earth/earth-color.jpg");
earthColorMap.encoding = THREE.sRGBEncoding;

// Debug
const debugObject = {};
debugObject.elapsedTime = 0;
debugObject.uTime = { value: 0 };
debugObject.uWaterElevation = { value: 0.1 };
debugObject.waterElevation = 5;
debugObject.uWaterFrequencyX = { value: 20 };
debugObject.uWaterFrequencyZ = { value: 30 };
debugObject.uWaterFrequencyY = { value: 2 };
debugObject.cloudSpeed = { value: 0.1 };
debugObject.uLightPos = { value: new THREE.Vector3(0.0) };
debugObject.emissiveIntensity = 100;
debugObject.earthSpin = 6;
debugObject.lightsTriggerThresh = 1;

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

/**
 * Environment map
 */

const envMap = new THREE.CubeTextureLoader()
  .setPath("/galaxy/")
  .load(["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"]);
envMap.encoding = THREE.sRGBEncoding;
scene.background = envMap;
scene.environment = envMap;
/**
 * Models
 */

const earthMaterial = new THREE.MeshStandardMaterial({
  map: earthColorMap,
  toneMapped: true,
  bumpMap: earthTextureBump,
  emissiveMap: earthTextureLights,
  emissive: new THREE.Color("#ffdf5a"),
  emissiveIntensity: debugObject.emissiveIntensity,
  metalnessMap: earthWaterMap,
  metalness: 0.1,
  roughness: 1,
  roughnessMap: earthTerrainMap,
  bumpScale: 1,
  envMap: envMap,
});

earthMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uWaterMap = { value: earthWaterMap };
  shader.uniforms.uElapsedTime = debugObject.uTime;
  shader.uniforms.uCloudsMap = { value: earthCloudMap };
  shader.uniforms.uWaterElevation = debugObject.uWaterElevation;
  shader.uniforms.uWaterFrequencyX = debugObject.uWaterFrequencyX;
  shader.uniforms.uWaterFrequencyY = debugObject.uWaterFrequencyY;
  shader.uniforms.uWaterFrequencyZ = debugObject.uWaterFrequencyZ;
  shader.uniforms.uLightPos = debugObject.uLightPos;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <metalnessmap_fragment>",
      `
        float metalnessFactor = metalness;
        
        #ifdef USE_METALNESSMAP

            vec4 texelMetalness = texture2D( metalnessMap, vUv );

            // reads channel B, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
            metalnessFactor *= texelMetalness.b ;

        #endif
        `
    )
    .replace(
      "#include <emissivemap_fragment>",
      `
    #ifdef USE_EMISSIVEMAP

        vec4 emissiveColor = texture2D( emissiveMap, vUv );
        vec3 newLightPos = uLightPos ;

        emissiveColor.rgb = emissiveMapTexelToLinear( emissiveColor ).rgb  ;
        float minVal = .2;
        float maxVal = 1.0;
        totalEmissiveRadiance *=  vec3(smoothstep(minVal,maxVal,emissiveColor.rgb)) ;

    #endif
    
    `
    )
    .replace(
      "#include <common>",
      `
        #include <common>
        varying float vElevation;
        uniform sampler2D uWaterMap;
        uniform sampler2D uCloudsMap;
        uniform float uElapsedTime;
        uniform vec3 uLightPos;

    `
    )
    .replace(
      "#include <color_fragment>",
      `
        
        #include <color_fragment>
        vec4 textel = texture2D( uWaterMap , vUv );
 
        diffuseColor.rgb += clamp(textel.r * vElevation * 2.0,0.0,0.5) ;
        diffuseColor.rgb += textel.r * smoothstep(.05,.5,vElevation) * 20.0;
         

    `
    );

  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <uv_pars_vertex>",
      `   #include <uv_pars_vertex>
        uniform sampler2D uWaterMap;
        uniform float uElapsedTime;
        uniform float uWaterElevation;
        uniform float uWaterFrequencyX;
        uniform float uWaterFrequencyY;
        uniform float uWaterFrequencyZ;

        varying float vElevation;
        //	Classic Perlin 3D Noise 
        //	by Stefan Gustavson
        //
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
        vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

        float cnoise(vec3 P){
        vec3 Pi0 = floor(P); // Integer part for indexing
        vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
        Pi0 = mod(Pi0, 289.0);
        Pi1 = mod(Pi1, 289.0);
        vec3 Pf0 = fract(P); // Fractional part for interpolation
        vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
        vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
        vec4 iy = vec4(Pi0.yy, Pi1.yy);
        vec4 iz0 = Pi0.zzzz;
        vec4 iz1 = Pi1.zzzz;

        vec4 ixy = permute(permute(ix) + iy);
        vec4 ixy0 = permute(ixy + iz0);
        vec4 ixy1 = permute(ixy + iz1);

        vec4 gx0 = ixy0 / 7.0;
        vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
        gx0 = fract(gx0);
        vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
        vec4 sz0 = step(gz0, vec4(0.0));
        gx0 -= sz0 * (step(0.0, gx0) - 0.5);
        gy0 -= sz0 * (step(0.0, gy0) - 0.5);

        vec4 gx1 = ixy1 / 7.0;
        vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
        gx1 = fract(gx1);
        vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
        vec4 sz1 = step(gz1, vec4(0.0));
        gx1 -= sz1 * (step(0.0, gx1) - 0.5);
        gy1 -= sz1 * (step(0.0, gy1) - 0.5);

        vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
        vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
        vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
        vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
        vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
        vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
        vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
        vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

        vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
        g000 *= norm0.x;
        g010 *= norm0.y;
        g100 *= norm0.z;
        g110 *= norm0.w;
        vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
        g001 *= norm1.x;
        g011 *= norm1.y;
        g101 *= norm1.z;
        g111 *= norm1.w;

        float n000 = dot(g000, Pf0);
        float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
        float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
        float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
        float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
        float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
        float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
        float n111 = dot(g111, Pf1);

        vec3 fade_xyz = fade(Pf0);
        vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
        vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
        float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
        return 2.2 * n_xyz;
        }

    `
    )
    .replace(
      "#include <begin_vertex>",
      `
        #include <begin_vertex>
        vec4 textel = texture2D( uWaterMap , vUv );
        float waterFrequencyX = uWaterFrequencyX;
        float waterFrequencyY = uWaterFrequencyY;
        float waterFrequencyZ = uWaterFrequencyZ;
        float elevationHeight = uWaterElevation;
        float elevation = sin( transformed.x * waterFrequencyX + uElapsedTime  * 2.0) * sin( transformed.z * uWaterFrequencyZ + uElapsedTime  * 2.0) * sin( transformed.y * uWaterFrequencyY + uElapsedTime  * 2.0) * .1  +.1;

        for(float i = 1.0; i<=4.0; i++){
            elevation +=  -abs(cnoise(vec3(transformed.xz * 30.0 * i,uElapsedTime * 0.2)) * .25 / i)   ;
        }
        transformed += textel.x * transformed * elevation * elevationHeight;

        vElevation = elevation;

    `
    );
};

const earthGeometry = new THREE.SphereBufferGeometry(1, 512, 512);

const earth = new THREE.Mesh(earthGeometry, earthMaterial);

const cloudMaterial = new THREE.MeshStandardMaterial({
  color: "white",
  alphaMap: earthCloudMap,
  transparent: true,
});

cloudMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uElapsedTime = debugObject.uTime;

  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `
    #include <common>
    uniform float uElapsedTime;
    `
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <alphamap_fragment>",
    `
    #ifdef USE_ALPHAMAP
    
    vec4 alphaText = texture2D( alphaMap, vUv );
    
    diffuseColor.a *= smoothstep(0.3,1.0,alphaText.g);
    
    #endif
    
    `
  );
};

const clouds = new THREE.Mesh(
  new SphereBufferGeometry(1, 16, 16),
  cloudMaterial
);
clouds.scale.set(1.02, 1.02, 1.02);
scene.add(clouds);

const uvs = earthGeometry.attributes.uv.array;
earthGeometry.setAttribute("uv2", new THREE.BufferAttribute(uvs, 2));

scene.add(earth);

const sunColor = new THREE.Color("#fbffd1");

const sun = new Mesh(
  new SphereBufferGeometry(0.5, 16, 16),
  new MeshStandardMaterial({
    color: sunColor,
    emissive: sunColor,
    emissiveIntensity: 20,
  })
);
sun.position.y = 1;
scene.add(sun);

const outerEarthGlow = new THREE.SpriteMaterial({
  map: textureLoader.load("/textures/earth/glow.png"),
  color: 0x0000ff,
  transparent: false,
  blending: THREE.AdditiveBlending,
});
const sprite = new THREE.Sprite(outerEarthGlow);
sprite.scale.set(2.3, 2.3, 1.0);
earth.add(sprite);

/**
 * Lights
 */

const ambientLight = new THREE.AmbientLight("#1d2951", 0.1);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(sunColor, 1, 100, 2);

pointLight.position.copy(sun.position);
scene.add(pointLight);

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.matrixAutoUpdate = true;
  composer.setSize(sizes.width, sizes.height);
  composer.setPixelRatio(Math.min(2, window.devicePixelRatio));
});

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  1,
  10
);
camera.position.set(4, 1, 0);
scene.add(camera);

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: false,
});
renderer.physicallyCorrectLights = false;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.toneMappingExposure = 1.5;

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const clock = new THREE.Clock(true);

const gui = new dat.GUI();

gui
  .add(debugObject, "waterElevation")
  .min(0)
  .max(30)
  .step(0.001)
  .name("Water Elevation");
gui
  .add(debugObject.cloudSpeed, "value")
  .min(0.001)
  .max(1)
  .step(0.001)
  .name("Cloud Speed");
gui
  .add(debugObject, "earthSpin")
  .min(1)
  .max(50)
  .step(0.001)
  .name("Earth Spin Speed");
gui
  .add(debugObject, "lightsTriggerThresh")
  .min(0.01)
  .max(4)
  .step(0.001)
  .name("Lights threshold")
  .onChange((val) => (debugObject.lightsTriggerThresh = val));

gui.close();

/**
 * Effects
 */
let RenderTargetClass = null;

if (renderer.getPixelRatio() === 1 && renderer.capabilities.isWebGL2) {
  RenderTargetClass = THREE.WebGLMultisampleRenderTarget;
  console.log("Using WebGLMultisampleRenderTarget");
} else {
  RenderTargetClass = THREE.WebGLRenderTarget;
  console.log("Using WebGLRenderTarget");
}

const renderTarget = new RenderTargetClass(sizes.width, sizes.height, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
  encoding: THREE.sRGBEncoding,
});

const renderPass = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width / 2, sizes.height / 2)
);

bloomPass.threshold = 0.9;
bloomPass.strength = 0.9;
bloomPass.radius = 0.9;

const composer = new EffectComposer(renderer, renderTarget);
composer.setSize(sizes.width, sizes.height);
composer.setPixelRatio(Math.min(2, window.devicePixelRatio));

composer.addPass(renderPass);
composer.addPass(bloomPass);

/**
 * Animate
 */
const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  debugObject.uTime.value = elapsedTime;
  debugObject.uLightPos.value.copy(pointLight.position);

  sun.position.x = Math.cos(elapsedTime) * 5;
  sun.position.z = Math.sin(elapsedTime) * 5;

  pointLight.position.copy(sun.position);

  //Audio visualization
  if (dataArray && !audio.paused) {
    const subVal = dataArray[2];
    const bassVal = dataArray[3];
    const midVal = dataArray[10];
    const midHighVal = dataArray[70];
    const highVal = dataArray[200];
    const superHighVal = dataArray[250];
    analyser.getByteFrequencyData(dataArray);
    if (Math.pow(midVal / 100, 10) / 50 > debugObject.lightsTriggerThresh) {
      sunColor.setHex(Math.floor((Math.random() * 16777215) & 0xff00ff));
      sun.material.emissive.copy(sunColor);
      sun.material.color.copy(sunColor);
      pointLight.color.copy(sunColor);
      sun.material.needsUpdate = true;
    }
    debugObject.uWaterElevation.value =
      (Math.pow(subVal / 100, 10) / 10000) * debugObject.waterElevation;
    clouds.rotation.y = elapsedTime * debugObject.cloudSpeed.value;
    clouds.rotation.y += Math.pow(bassVal / 100, 10) / 10000;
    debugObject.uWaterFrequencyX.value += Math.pow(midVal / 100, 10) / 100000;
    debugObject.uWaterFrequencyY.value += Math.pow(highVal / 100, 9) / 1000;
    debugObject.uWaterFrequencyZ.value +=
      Math.pow(superHighVal / 100, 9) / 1000;
    earth.rotation.y -=
      (Math.pow(midHighVal / 100, 5) / 500) * debugObject.earthSpin;
  }
  camera.position.x = Math.cos(elapsedTime / 10) * 3.5;
  camera.position.z = Math.sin(elapsedTime / 10) * 3.5;
  camera.lookAt(earth.position);

  composer.render();
  window.requestAnimationFrame(tick);
};

tick();
