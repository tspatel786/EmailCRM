import { useEffect, useRef } from "react";
import * as THREE from "three";

export function ThreeBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b14, 0.035);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // 2. Warm Cinematic Lights
    const ambientLight = new THREE.AmbientLight(0xfff5ea, 1.2);
    scene.add(ambientLight);

    const amberLight = new THREE.PointLight(0xf59e0b, 35, 30);
    amberLight.position.set(-8, 6, 8);
    scene.add(amberLight);

    const cyanLight = new THREE.PointLight(0x06b6d4, 30, 30);
    cyanLight.position.set(8, -6, 6);
    scene.add(cyanLight);

    const purpleLight = new THREE.PointLight(0xa855f7, 25, 25);
    purpleLight.position.set(0, 8, -4);
    scene.add(purpleLight);

    // 3. Playful Floating 3D Shapes
    const shapesGroup = new THREE.Group();
    scene.add(shapesGroup);

    interface FloatingItem {
      mesh: THREE.Object3D;
      rotSpeed: { x: number; y: number; z: number };
      floatSpeed: number;
      floatOffset: number;
      initialY: number;
    }
    const floatingItems: FloatingItem[] = [];

    // Helper to create glossy materials
    const createGlossyMaterial = (color: number, roughness = 0.25, metalness = 0.4) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        wireframe: false,
      });

    // A. Main Holographic / Glassy Icosahedron (Top-Left)
    const icoGeo = new THREE.IcosahedronGeometry(2.4, 0);
    const icoMat = createGlossyMaterial(0xf59e0b, 0.2, 0.6);
    const icoMesh = new THREE.Mesh(icoGeo, icoMat);
    icoMesh.position.set(-7, 3, -1);
    shapesGroup.add(icoMesh);
    floatingItems.push({
      mesh: icoMesh,
      rotSpeed: { x: 0.006, y: 0.009, z: 0.004 },
      floatSpeed: 0.0018,
      floatOffset: 0,
      initialY: 3,
    });

    // Wireframe cage around icosahedron
    const icoWireMat = new THREE.MeshBasicMaterial({ color: 0xfde68a, wireframe: true, transparent: true, opacity: 0.25 });
    const icoWire = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), icoWireMat);
    icoMesh.add(icoWire);

    // B. Smooth Floating Torus (Bottom-Right)
    const torusGeo = new THREE.TorusGeometry(2.2, 0.65, 24, 48);
    const torusMat = createGlossyMaterial(0x38bdf8, 0.2, 0.5);
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    torusMesh.position.set(7.5, -3, 0);
    shapesGroup.add(torusMesh);
    floatingItems.push({
      mesh: torusMesh,
      rotSpeed: { x: 0.008, y: 0.005, z: 0.007 },
      floatSpeed: 0.0014,
      floatOffset: Math.PI / 2,
      initialY: -3,
    });

    // C. Soft Bouncing Violet Octahedron (Top-Right)
    const octaGeo = new THREE.OctahedronGeometry(1.8, 0);
    const octaMat = createGlossyMaterial(0xc084fc, 0.25, 0.5);
    const octaMesh = new THREE.Mesh(octaGeo, octaMat);
    octaMesh.position.set(6.5, 4.5, -2);
    shapesGroup.add(octaMesh);
    floatingItems.push({
      mesh: octaMesh,
      rotSpeed: { x: -0.005, y: 0.008, z: 0.003 },
      floatSpeed: 0.002,
      floatOffset: Math.PI / 3,
      initialY: 4.5,
    });

    // D. Soft Amber-Coral Sphere (Bottom-Left)
    const sphereGeo = new THREE.SphereGeometry(1.5, 32, 32);
    const sphereMat = createGlossyMaterial(0xfb923c, 0.15, 0.3);
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.position.set(-6.5, -4, 1);
    shapesGroup.add(sphereMesh);
    floatingItems.push({
      mesh: sphereMesh,
      rotSpeed: { x: 0.004, y: 0.004, z: 0.002 },
      floatSpeed: 0.0016,
      floatOffset: Math.PI,
      initialY: -4,
    });

    // E. Mini Playful Spheres floating gently
    const miniColors = [0xf59e0b, 0x14b8a6, 0x8b5cf6, 0xec4899, 0x3b82f6];
    const miniCoords = [
      { x: -3.5, y: 5.5, z: -3 },
      { x: 3.5, y: -5, z: -2 },
      { x: -8, y: -0.5, z: -4 },
      { x: 8.5, y: 1.5, z: -3 },
      { x: 0, y: -6.5, z: -1 },
    ];

    miniCoords.forEach((coord, i) => {
      const geo = new THREE.SphereGeometry(0.55 + Math.random() * 0.3, 24, 24);
      const colorVal = miniColors[i % miniColors.length] ?? 0xf59e0b;
      const mat = createGlossyMaterial(colorVal, 0.2, 0.4);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(coord.x, coord.y, coord.z);
      shapesGroup.add(mesh);
      floatingItems.push({
        mesh,
        rotSpeed: { x: 0.01, y: 0.01, z: 0.01 },
        floatSpeed: 0.0025 + i * 0.0004,
        floatOffset: i * 1.2,
        initialY: coord.y,
      });
    });

    // 4. Floating Ambient Particle Field (Glowing Star-dust)
    const particleCount = 280;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const pColor1 = new THREE.Color(0xf59e0b); // amber
    const pColor2 = new THREE.Color(0x38bdf8); // sky
    const pColor3 = new THREE.Color(0xa855f7); // purple

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      const mixed = Math.random() < 0.4 ? pColor1 : Math.random() < 0.7 ? pColor2 : pColor3;
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 5. Parallax Cursor Interaction
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMouseMove);

    // 6. Responsive Resize Handler
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // 7. Animation Loop with soft bounce and smooth parallax
    let reqId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth camera parallax
      currentMouseX += (targetMouseX - currentMouseX) * 0.05;
      currentMouseY += (targetMouseY - currentMouseY) * 0.05;

      camera.position.x = currentMouseX * 1.8;
      camera.position.y = currentMouseY * 1.4;
      camera.lookAt(0, 0, 0);

      // Rotate and gently bounce shapes
      floatingItems.forEach((item) => {
        item.mesh.rotation.x += item.rotSpeed.x;
        item.mesh.rotation.y += item.rotSpeed.y;
        item.mesh.rotation.z += item.rotSpeed.z;

        // Gentle harmonic bobbing
        item.mesh.position.y = item.initialY + Math.sin(elapsedTime * 1.5 + item.floatOffset) * 0.35;
      });

      // Slowly rotate particle field
      particles.rotation.y = elapsedTime * 0.02;
      particles.rotation.x = Math.sin(elapsedTime * 0.015) * 0.05;

      // Soft light rotation
      amberLight.position.x = -8 + Math.cos(elapsedTime * 0.5) * 1.5;
      cyanLight.position.x = 8 + Math.sin(elapsedTime * 0.5) * 1.5;

      renderer.render(scene, camera);
    };

    animate();

    // 8. Cleanup
    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);

      // Dispose
      icoGeo.dispose();
      icoMat.dispose();
      torusGeo.dispose();
      torusMat.dispose();
      octaGeo.dispose();
      octaMat.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    />
  );
}
