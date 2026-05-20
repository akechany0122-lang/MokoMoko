const fs = require('fs');
const file = 'index.html';
let content = fs.readFileSync(file, 'utf8');

const newGenerate = `      generate() {
        this.clear();
        
        const f = extractFeatures();

        // --- 1. 背景の動的合成 ---
        let bgLightness = 0.1;
        let bgSaturation = 0.2;
        if (f.softness > Math.max(f.sharpness, f.roughness, f.flow)) {
            bgLightness = 0.85; // 柔らかい時はパステル調の明るい背景
            bgSaturation = 0.1;
        } else if (f.sharpness > Math.max(f.roughness, f.flow) && f.maxRms > 0.3) {
            bgLightness = 0.9; // 鋭いインパクト時は真っ白に近い背景
            bgSaturation = 0.05;
        } else if (f.flow > Math.max(f.sharpness, f.roughness)) {
            bgLightness = 0.05; // フロー時はネオンを際立たせる暗い背景
        }
        
        this.scene.background = new THREE.Color().setHSL(f.hue, bgSaturation, bgLightness);
        this.scene.fog = new THREE.FogExp2(this.scene.background, 0.002);

        // 照明
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);
        
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(30, 50, 40);
        this.scene.add(mainLight);
        
        const rimLight = new THREE.DirectionalLight(new THREE.Color().setHSL((f.hue+0.5)%1, 1, 0.5), 2.0);
        rimLight.position.set(-30, -20, -50);
        this.scene.add(rimLight);

        // 空間全体をまとめるグループ
        let group = new THREE.Group();
        this.scene.add(group);
        this.objects.push({ mesh: group, ry: 0.002, rx: 0.001 });

        // --- Layer 1: VOXEL TERRAIN (Roughnessが強い時) ---
        // 添付画像の「ボクセル都市/山」のような空間
        if (f.roughness > 0.1) {
            let count = 20; // 20x20のグリッド
            let size = 15;
            let terrainGeo = new THREE.BoxGeometry(size*0.9, 1, size*0.9);
            let terrainMat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color().setHSL(f.hue, 0.8, 0.4),
                roughness: 0.9, metalness: 0.2, clearcoat: 0.1
            });
            let instMesh = new THREE.InstancedMesh(terrainGeo, terrainMat, count * count);
            let dummy = new THREE.Object3D();
            let idx = 0;
            for(let x=0; x<count; x++) {
                for(let z=0; z<count; z++) {
                    let px = (x - count/2) * size;
                    let pz = (z - count/2) * size;
                    let d = Math.sqrt(px*px + pz*pz);
                    let h = Math.random() * 150 * f.roughness * Math.max(0, (1 - d/300));
                    
                    // 軌跡の近くは隆起する
                    f.pathPts.forEach(pt => {
                        let distL = Math.sqrt(Math.pow(pt.posL.x - px, 2) + Math.posL.z - pz, 2);
                        if(distL < 60) h += (60 - distL) * pt.rms * f.roughness * 2;
                        let distR = Math.sqrt(Math.pow(pt.posR.x - px, 2) + Math.posR.z - pz, 2);
                        if(distR < 60) h += (60 - distR) * pt.rms * f.roughness * 2;
                    });
                    
                    dummy.position.set(px, h/2 - 80, pz);
                    dummy.scale.set(1, Math.max(1, h), 1);
                    dummy.updateMatrix();
                    instMesh.setMatrixAt(idx, dummy.matrix);
                    
                    let c = new THREE.Color().setHSL((f.hue + h*0.002)%1, 0.8, 0.2 + (h/300));
                    instMesh.setColorAt(idx, c);
                    idx++;
                }
            }
            group.add(instMesh);
        }

        // --- Layer 2: EXPLOSION SHARDS (Sharpnessが強い時) ---
        // 添付画像の「破片が弾けるような」空間
        if (f.sharpness > 0.1) {
            let shardGeo = new THREE.TetrahedronGeometry(1, 0);
            let shardMat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color().setHSL((f.hue + 0.1)%1, 1.0, 0.5),
                metalness: 0.9, roughness: 0.1,
                emissive: new THREE.Color().setHSL(f.hue, 1.0, 0.2)
            });
            let shardCount = Math.floor(f.sharpness * 300);
            let instMesh = new THREE.InstancedMesh(shardGeo, shardMat, shardCount);
            let dummy = new THREE.Object3D();
            
            // 軌跡の中心または原点から爆発
            let center = new THREE.Vector3();
            if(f.pathPts.length > 0) center.copy(f.pathPts[Math.floor(f.pathPts.length/2)].posL);
            
            for(let i=0; i<shardCount; i++) {
                let dir = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize();
                let dist = Math.random() * 200 * f.sharpness;
                dummy.position.copy(center).add(dir.multiplyScalar(dist));
                
                // 鋭く細長いスケール
                let sx = 2 + Math.random() * 5 * f.sharpness;
                let sy = 20 + Math.random() * 80 * f.sharpness;
                let sz = 2 + Math.random() * 5 * f.sharpness;
                
                dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
                dummy.scale.set(sx, sy, sz);
                dummy.updateMatrix();
                instMesh.setMatrixAt(i, dummy.matrix);
                
                let isBlack = Math.random() > 0.7;
                let c = isBlack ? new THREE.Color(0x111111) : (Math.random() > 0.5 ? new THREE.Color(0xffffff) : new THREE.Color().setHSL((f.hue+0.5)%1,1,0.5));
                instMesh.setColorAt(i, c);
            }
            group.add(instMesh);
            this.objects.push({ mesh: instMesh, ry: 0.005 });
        }

        // --- Layer 3: FLOWING NEON TUBES (Flowが強い時) ---
        // 添付画像の「滑らかなネオンチューブ」の空間
        if (f.flow > 0.1 && f.pathPts.length > 3) {
            let ptsL = f.pathPts.map(p => p.posL);
            let curveL = new THREE.CatmullRomCurve3(ptsL);
            
            let numTubes = Math.floor(1 + f.flow * 5);
            for(let t=0; t<numTubes; t++) {
                // 中心軌跡を少しオフセットして複数本のチューブを並行に走らせる
                let offset = new THREE.Vector3((Math.random()-0.5)*50, (Math.random()-0.5)*50, (Math.random()-0.5)*50);
                let offsetPts = ptsL.map(p => p.clone().add(offset));
                let offsetCurve = new THREE.CatmullRomCurve3(offsetPts);
                
                let radius = 2 + Math.random() * 10 * f.flow;
                let tubeGeo = new THREE.TubeGeometry(offsetCurve, 100, radius, 8, false);
                let tubeMat = new THREE.MeshPhysicalMaterial({
                    color: new THREE.Color().setHSL((f.hue - (t*0.1))%1, 1.0, 0.6),
                    emissive: new THREE.Color().setHSL((f.hue - (t*0.1))%1, 1.0, 0.4),
                    emissiveIntensity: 0.5, clearcoat: 1.0, roughness: 0.1
                });
                let tube = new THREE.Mesh(tubeGeo, tubeMat);
                group.add(tube);
            }
        }

        // --- Layer 4: ORGANIC WIREFRAME CLOUD (Softnessが強い時) ---
        // 添付画像の「柔らかく有機的な網目」の空間
        if (f.softness > 0.1) {
            let cloudGeo = new THREE.IcosahedronGeometry(60 + f.softness*40, 4);
            let pos = cloudGeo.attributes.position;
            let vec = new THREE.Vector3();
            // ノイズによる有機的な変形
            for(let i=0; i<pos.count; i++) {
                vec.fromBufferAttribute(pos, i);
                let noise = Math.sin(vec.x*0.05) * Math.cos(vec.y*0.05) * Math.sin(vec.z*0.05);
                let disp = noise * 50 * f.softness;
                vec.add(vec.clone().normalize().multiplyScalar(disp));
                pos.setXYZ(i, vec.x, vec.y, vec.z);
            }
            cloudGeo.computeVertexNormals();
            
            let cloudMat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color().setHSL(f.hue, 0.5, 0.9),
                transmission: 0.9, opacity: 1, transparent: true,
                roughness: 0.1, ior: 1.2,
                wireframe: f.softness > 0.4
            });
            let cloud = new THREE.Mesh(cloudGeo, cloudMat);
            group.add(cloud);
            this.objects.push({ mesh: cloud, rx: 0.003, ry: -0.002 });
        }

        // --- 5. ユーザーの動きの軌跡 (Particle Trace) ---
        // 生成された空間と自身の身体の動きを結びつけるために軌跡の光を描画
        let traceGeo = new THREE.BufferGeometry();
        let tracePts = [];
        let traceColors = [];
        f.pathPts.forEach((pt, i) => {
            if(pt.hasL) {
                tracePts.push(pt.posL.x, pt.posL.y, pt.posL.z);
                let c = new THREE.Color().setHSL((f.hue + i/f.pathPts.length)%1, 1, 0.8);
                traceColors.push(c.r, c.g, c.b);
            }
            if(pt.hasR) {
                tracePts.push(pt.posR.x, pt.posR.y, pt.posR.z);
                let c = new THREE.Color().setHSL((f.hue + i/f.pathPts.length)%1, 1, 0.8);
                traceColors.push(c.r, c.g, c.b);
            }
        });
        if (tracePts.length > 0) {
            traceGeo.setAttribute('position', new THREE.Float32BufferAttribute(tracePts, 3));
            traceGeo.setAttribute('color', new THREE.Float32BufferAttribute(traceColors, 3));
            let traceMat = new THREE.PointsMaterial({ size: 3, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true });
            let tracePoints = new THREE.Points(traceGeo, traceMat);
            group.add(tracePoints);
        }

        // --- カメラ位置の自動調整 ---
        let box = new THREE.Box3().setFromObject(group);
        let center = new THREE.Vector3();
        if (!box.isEmpty()) {
            box.getCenter(center);
            this.controls.target.copy(center);
            let size = new THREE.Vector3();
            box.getSize(size);
            let maxDim = Math.max(size.x, size.y, size.z);
            let distance = Math.max(150, maxDim * 1.0);
            this.camera.position.set(center.x, center.y, center.z + distance);
        } else {
            this.camera.position.set(0, 0, 150);
        }

        this.animate = this.animate.bind(this);
        this.animate();
      }`;

const startIndex = content.indexOf('      generate() {');
const endIndex = content.indexOf('      animate() {');

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + newGenerate + '\n\n' + content.substring(endIndex);
    fs.writeFileSync(file, content);
    console.log("Successfully replaced generate method.");
} else {
    console.log("Could not find start or end index.");
}
