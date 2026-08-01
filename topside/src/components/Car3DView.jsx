import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Paper, Typography, Box, Chip } from '@mui/material';
import { Compass } from 'lucide-react';

export default function Car3DView({ roll = 0, pitch = 0, yaw = 0 }) {
  const mountRef = useRef(null);
  const carGroupRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161b26);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2.5, 2.0, 3.0);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x7cacf8, 1.5);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const grid = new THREE.GridHelper(6, 12, 0x7cacf8, 0x2e384d);
    grid.position.y = -0.4;
    scene.add(grid);

    const carGroup = new THREE.Group();

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(1.2, 0.25, 0.9);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.6,
      roughness: 0.3
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    carGroup.add(chassis);

    // Top Cover
    const topGeo = new THREE.BoxGeometry(0.8, 0.1, 0.6);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
    const topCover = new THREE.Mesh(topGeo, topMat);
    topCover.position.set(0, 0.18, 0);
    carGroup.add(topCover);

    // Arrow Indicator
    const arrowGeo = new THREE.ConeGeometry(0.18, 0.4, 4);
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x4edea3, emissive: 0x10b981 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0.5, 0.15, 0);
    carGroup.add(arrow);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });

    const wheelPositions = [
      [0.4, -0.1, 0.45],
      [0.4, -0.1, -0.45],
      [-0.4, -0.1, 0.45],
      [-0.4, -0.1, -0.45]
    ];

    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(...pos);
      carGroup.add(wheel);
    });

    scene.add(carGroup);
    carGroupRef.current = carGroup;

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // ResizeObserver for modern fluid layout adaptation
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (carGroupRef.current) {
      const rRad = (roll * Math.PI) / 180;
      const pRad = (pitch * Math.PI) / 180;
      const yRad = (yaw * Math.PI) / 180;

      carGroupRef.current.rotation.set(rRad, yRad, pRad, 'ZYX');
    }
  }, [roll, pitch, yaw]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        bgcolor: 'background.paper',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 340,
        position: 'relative'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Compass size={20} color="#7cacf8" />
          <Typography variant="h6" color="text.primary">
            3D 姿态展示 (IMU Telemetry)
          </Typography>
        </Box>
        <Chip label="Three.js Live" color="primary" size="small" variant="outlined" />
      </Box>

      {/* Fluid 3D Canvas Container */}
      <Box
        ref={mountRef}
        sx={{
          flex: 1,
          width: '100%',
          minHeight: 220,
          borderRadius: 3,
          overflow: 'hidden',
          bgcolor: 'surface.container',
          position: 'relative'
        }}
      />

      {/* Angle Badges Footer */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          mt: 1.5
        }}
      >
        <Box sx={{ p: 1, bgcolor: 'surface.container', borderRadius: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" display="block">
            横滚 Roll
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'status.ok' }}>
            {roll.toFixed(1)}°
          </Typography>
        </Box>
        <Box sx={{ p: 1, bgcolor: 'surface.container', borderRadius: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" display="block">
            俯仰 Pitch
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'status.info' }}>
            {pitch.toFixed(1)}°
          </Typography>
        </Box>
        <Box sx={{ p: 1, bgcolor: 'surface.container', borderRadius: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" display="block">
            偏航 Yaw
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'status.warn' }}>
            {yaw.toFixed(1)}°
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
