import ROSLIB from 'roslib';

const finiteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const nestedNumber = (message, ...path) => {
  let value = message;
  for (const key of path) {
    if (value === null || typeof value !== 'object') return 0;
    value = value[key];
  }
  return finiteNumber(value);
};

class RosService {
  constructor() {
    this.ros = null;
    this.isConnected = false;
    this.url = 'ws://192.168.10.17:9090'; // Default Raspberry Pi IP
    this.listeners = new Set();
    this.topics = {};

    // Cached state values
    this.telemetry = {
      voltage: 0,
      percentage: 0,
      linearX: 0,
      linearY: 0,
      angularZ: 0,
      roll: 0,
      pitch: 0,
      yaw: 0,
      odomX: 0,
      odomY: 0,
      rawImu: null,
      rawBattery: null,
      // 缓存最新的 Web 遥测消息，不再缓存完整 Odometry。
      rawOdom: {
        twist: null,
        pose2d: null
      }
    };
  }

  connect(customUrl) {
    if (customUrl) {
      this.url = customUrl;
    }

    if (this.ros) {
      try {
        this.ros.close();
      } catch (e) {
        // ignore
      }
    }

    console.log(`[RosService] Connecting to ROS Bridge at ${this.url}...`);
    this.notifyListeners({ status: 'CONNECTING', url: this.url });

    this.ros = new ROSLIB.Ros({
      url: this.url
    });

    this.ros.on('connection', () => {
      console.log('[RosService] Connected to ROS Bridge!');
      this.isConnected = true;
      this.notifyListeners({ status: 'CONNECTED', url: this.url });
      this.setupSubscriptions();
    });

    this.ros.on('error', (error) => {
      console.warn('[RosService] ROS Bridge Error:', error);
      this.isConnected = false;
      this.notifyListeners({ status: 'ERROR', error, url: this.url });
    });

    this.ros.on('close', () => {
      console.log('[RosService] ROS Bridge connection closed.');
      this.isConnected = false;
      this.notifyListeners({ status: 'DISCONNECTED', url: this.url });
    });
  }

  disconnect() {
    if (this.ros) {
      this.ros.close();
      this.ros = null;
    }
    this.isConnected = false;
    this.notifyListeners({ status: 'DISCONNECTED', url: this.url });
  }

  setupSubscriptions() {
    if (!this.ros || !this.isConnected) return;

    // 1. Battery State Topic
    this.topics.battery = new ROSLIB.Topic({
      ros: this.ros,
      name: '/battery_state',
      messageType: 'sensor_msgs/msg/BatteryState'
    });

    this.topics.battery.subscribe((message) => {
      const v = message.voltage || 0;
      this.telemetry.voltage = v;
      this.telemetry.rawBattery = message;

      // 3S Ternary Lithium Battery (3S8P): 9.0V (0%) to 12.6V (100%)
      // 3.0V - 4.2V per cell
      let pct = 0;
      if (v >= 12.6) pct = 100;
      else if (v <= 9.0) pct = 0;
      else {
        pct = Math.round(((v - 9.0) / (12.6 - 9.0)) * 100);
      }
      this.telemetry.percentage = Math.max(0, Math.min(100, pct));

      this.notifyListeners({ type: 'TELEMETRY_UPDATE', telemetry: this.telemetry });
      this.notifyListeners({ type: 'TOPIC_MSG', topic: '/battery_state', message, direction: 'UPLINK' });
    });

    // 2. IMU Topic (3D Orientation)
    this.topics.imu = new ROSLIB.Topic({
      ros: this.ros,
      name: '/imu/data_raw',
      messageType: 'sensor_msgs/msg/Imu'
    });

    this.topics.imu.subscribe((message) => {
      this.telemetry.rawImu = message;
      const q = message.orientation;
      if (q) {
        // Convert Quaternion to Euler angles (Roll, Pitch, Yaw in degrees)
        const roll = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
        const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.y - q.z * q.x))));
        const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));

        this.telemetry.roll = (roll * 180) / Math.PI;
        this.telemetry.pitch = (pitch * 180) / Math.PI;
        this.telemetry.yaw = (yaw * 180) / Math.PI;
      }
      this.notifyListeners({ type: 'TELEMETRY_UPDATE', telemetry: this.telemetry });
      this.notifyListeners({ type: 'TOPIC_MSG', topic: '/imu/data_raw', message, direction: 'UPLINK' });
    });

    // 3. Web Telemetry Topics
    this.topics.telemetryTwist = new ROSLIB.Topic({
      ros: this.ros,
      name: '/web/telemetry/twist',
      messageType: 'geometry_msgs/msg/TwistStamped'
    });

    this.topics.telemetryTwist.subscribe((message) => {
      this.telemetry.rawOdom = {
        ...this.telemetry.rawOdom,
        twist: message || null
      };
      this.telemetry.linearX = nestedNumber(message, 'twist', 'linear', 'x');
      this.telemetry.linearY = nestedNumber(message, 'twist', 'linear', 'y');
      this.telemetry.angularZ = nestedNumber(message, 'twist', 'angular', 'z');
      this.notifyListeners({ type: 'TELEMETRY_UPDATE', telemetry: this.telemetry });
      this.notifyListeners({ type: 'TOPIC_MSG', topic: '/web/telemetry/twist', message, direction: 'UPLINK' });
    });

    this.topics.telemetryPose2d = new ROSLIB.Topic({
      ros: this.ros,
      name: '/web/telemetry/pose2d',
      messageType: 'geometry_msgs/msg/Pose2D'
    });

    this.topics.telemetryPose2d.subscribe((message) => {
      this.telemetry.rawOdom = {
        ...this.telemetry.rawOdom,
        pose2d: message || null
      };
      this.telemetry.odomX = nestedNumber(message, 'x');
      this.telemetry.odomY = nestedNumber(message, 'y');
      this.notifyListeners({ type: 'TELEMETRY_UPDATE', telemetry: this.telemetry });
      this.notifyListeners({ type: 'TOPIC_MSG', topic: '/web/telemetry/pose2d', message, direction: 'UPLINK' });
    });

    // 4. Reference Command Publisher & Subscriber
    this.topics.cmdVel = new ROSLIB.Topic({
      ros: this.ros,
      name: '/mecanum_drive_controller/reference',
      messageType: 'geometry_msgs/msg/TwistStamped'
    });

    this.topics.cmdVel.subscribe((message) => {
      this.notifyListeners({ type: 'TOPIC_MSG', topic: '/mecanum_drive_controller/reference', message, direction: 'DOWNLINK' });
    });
  }

  publishCmdVel(lx = 0, ly = 0, az = 0) {
    if (!this.ros || !this.isConnected || !this.topics.cmdVel) return;

    // Use sec=0, nanosec=0 to bypass controller timestamp validation.
    // This prevents message rejection due to clock skew between PC and Robot.
    const twistMsg = new ROSLIB.Message({
      header: {
        stamp: {
          sec: 0,
          nanosec: 0
        },
        frame_id: 'base_link'
      },
      twist: {
        linear: { x: lx, y: ly, z: 0.0 },
        angular: { x: 0.0, y: 0.0, z: az }
      }
    });

    this.topics.cmdVel.publish(twistMsg);
    this.notifyListeners({ type: 'TOPIC_MSG', topic: '/mecanum_drive_controller/reference', message: twistMsg, direction: 'DOWNLINK' });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(data) {
    this.listeners.forEach((fn) => fn(data));
  }
}

export const rosService = new RosService();
