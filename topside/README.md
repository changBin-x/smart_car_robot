# smart_car_robot 上位机界面 (Topside UI)

[![Node.js](https://img.shields.io/badge/Node.js-v24.18.0-blue.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v18.2.0-blue.svg)](https://react.dev/)
[![Material Design 3](https://img.shields.io/badge/Design_System-Material_Design_3-7cacf8.svg)](https://m3.material.io/)
[![ROS 2](https://img.shields.io/badge/ROS_2-Jazzy-orange.svg)](https://docs.ros.org/en/jazzy/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

基于 **React 18 + Vite + Material Design 3 (MD3) + Three.js + Node.js** 的四轮麦克纳姆轮全向智能小车上位机控制与监控系统。支持通过 `rosbridge_websocket` (端口 `9090`) 远程连接树莓派 4B (`192.168.10.12`)，实现高频姿态遥测、电池电量精准估算、高德地图轨迹追踪、全向运动控制、指令调试控制台与历史数据持久化查询。

---

## 特性

- 🎨 **Material Design 3 科技美学**: 采用 MD3 暗色动态色彩系统与高对比度 Surface 容器，界面现代好读。
- ⚡ **实时速度解算**: 实时解析闭环 feedback，展示前后线速度 $v_x$、左右线速度 $v_y$ 及旋转角速度 $\omega_z$。
- 🔋 **3S8P 三元锂电池电量估算**:
  - 针对 3S 电池全组电压区间 `9.0 V (0%)` ~ `12.6 V (100%)`（额定 `11.1 V`）精准推算剩余百分比；
  - 动态显示 S1、S2、S3 单体估计电压与低电量警告。
- 🗺️ **高德地图定位 & 摄像机画面切换**:
  - 支持配置高德地图 Web JS API Key，基于里程计/定位高精追踪小车在地图上的实时点位与轨迹；
  - 一键切换至摄像头画面，支持未接硬件时的科技感占位 UI 交互。
- 🧭 **Three.js 3D 车体姿态可视化**: 订阅 `/imu/data_raw` 话题，实时在 WebGL 3D 麦轮模型中渲染小车横滚 (Roll)、俯仰 (Pitch)、偏航 (Yaw) 姿态变化。
- 🎮 **全向运动控制面板**:
  - 具备前进、后退、左右平移（麦轮独有）、左右旋转与急停控制；
  - 全面支持 WASD QE / Space 键盘快捷键高灵敏度响应。
- 💻 **指令调试 Console**: 实时捕获下发控制指令 (Downlink) 与传感器上报指令 (Uplink) 及中间状态，支持 JSON 原包查看与话题过滤。
- 💾 **历史数据持久化查询**: Node.js 后端守护进程实时将收发指令存入数据库，提供独立的数据查询界面，支持按时间、方向、话题筛选与 JSON 导出。

---

## 架构说明

上位机采用前后端一体化架构：

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       前端 (React 18 + Three.js + MD3)                       │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│ │  状态控制主页        │ │  指令调试 Console   │ │  历史数据查询 Data   │ │
│ └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘ │
└────────────┼────────────────────────┼────────────────────────┼─────────────┘
             │ WebSocket (9090)       │ REST API (/api/logs)   │ REST API
┌────────────▼────────────────────────▼────────────────────────▼─────────────┐
│                       后端 (Node.js Express + SQLite/JSON)                  │
│                  - 自动监听 ROS 2 话题并持久化入库                              │
│                  - 提供历史日志分页检索与统计 REST API                        │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ ws://192.168.10.12:9090
┌─────────────────────────────────────▼───────────────────────────────────────┐
│              树莓派 4B (ROS 2 Jazzy + rosbridge_websocket)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 目录结构

```text
topside/
├── dist/                   # Vite 生产打包产物 (自动由后端静态托管)
├── server/
│   ├── db.js               # 数据持久化存储与查询 CRUD 模块
│   ├── index.js            # Express API 服务器与 ROS 2 遥测监听 Agent
│   └── smartcar_telemetry_db.json # 本地持久化数据存储文件
├── src/
│   ├── components/         # 页面与 UI 组件
│   │   ├── BatteryWidget.jsx   # 3S8P 锂电池电量估算组件
│   │   ├── Car3DView.jsx       # Three.js 3D 姿态展示组件
│   │   ├── ControlPanel.jsx    # 全向运动控制面板
│   │   ├── DashboardView.jsx   # 状态与控制主页视图
│   │   ├── DataQueryView.jsx   # 历史数据查询页面
│   │   ├── DebugConsoleView.jsx# 指令调试 Console
│   │   ├── MapCameraView.jsx   # 高德地图与摄像机切换组件
│   │   └── Navbar.jsx          # MD3 应用导航与 IP 配置栏
│   ├── services/
│   │   └── rosbridge.js    # ROS 2 WebSocket 通信服务
│   ├── theme/
│   │   └── md3Theme.js     # Material Design 3 主题样式配置
│   ├── App.jsx             # React 主应用入口
│   └── main.jsx            # 渲染入口
├── index.html              # HTML 模板
├── package.json            # 依赖包配置
└── vite.config.js          # Vite 构建与代理配置
```

---

## 快速开始

### 环境要求

- **Node.js**: `>= 18.0.0` (推荐 Node.js v24)
- **npm**: `>= 9.0.0`
- **ROS 2 主机**: 树莓派 4B (`192.168.10.12`) 运行 ROS 2 Jazzy 并开启 `rosbridge_websocket` (端口 `9090`)

### 安装依赖

进入 `topside` 目录并安装依赖：

```bash
cd topside
npm install
```

### 启动服务

运行以下命令即可同时启动 Express 后端服务器与静态 Web 控制台：

```bash
node server/index.js
```

启动成功后，在浏览器中打开 `http://localhost:3223` 即可进入上位机控制台。

### 开发模式 (可选)

如需进行前端组件开发与热重载：

```bash
# 启动前端开发服务器 (默认端口 3000)
npm run dev
```

---

## 通信话题映射

| 话题 (Topic) | 消息类型 (Type) | 方向 | 刷新频率 | 说明 |
|---|---|---|---|---|
| `/battery_state` | `sensor_msgs/msg/BatteryState` | UPLINK (上传) | ~1 Hz | 母线电压输入，用于 3S8P 电量估算 |
| `/imu/data_raw` | `sensor_msgs/msg/Imu` | UPLINK (上传) | ~100 Hz | MPU6050 姿态角 (Roll, Pitch, Yaw) |
| `/mecanum_drive_controller/odometry` | `nav_msgs/msg/Odometry` | UPLINK (上传) | ~50 Hz | 里程计线速度 $v_x, v_y$ 与位置坐标 $x, y$ |
| `/mecanum_drive_controller/reference` | `geometry_msgs/msg/TwistStamped` | DOWNLINK (下发) | 按需下发 | 上位机发起的麦轮全向控制运动指令 |

---

## 许可证

本项目基于 [MIT](./LICENSE) 协议开源。
