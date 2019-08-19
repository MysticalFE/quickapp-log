/**
 * 日志打点上报
 *
 * 处理读写并发？？？？？
 */
import config from "./logConfig";
import file from "@system.file";
import $fetch from "@system.fetch";
import $utils from "../utils";
import app from "@system.app";
import device from "@system.device";
import network from "@system.network";
import storage from "@system.storage";
import request from "@system.request";
(function(APP) {
  const FILE_PATH = "internal://files";
  const REAL_API_PATH = $utils.composePath("*****");
  const OFFLINE_API_PATH = $utils.composePath("*****");
  const packageName = "*******";
  const initIntervalSec = 2 * 60 * 1000;
  function initLogStorage() {
    let obj = {};
    for (let key in config.detail) {
      obj[key] = "";
    }
    return obj;
  }
  function date() {
    const date = new Date();
    const dateObj = {
      y: date.getFullYear(),
      M: date.getMonth() > 8 ? date.getMonth() + 1 : `0${date.getMonth() + 1}`,
      d: date.getDate() > 9 ? date.getDate() : `0${date.getDate()}`,
      h: date.getHours() > 9 ? date.getHours() : `0${date.getHours()}`,
      m: date.getMinutes() > 9 ? date.getMinutes() : `0${date.getMinutes()}`,
      s: date.getSeconds() > 9 ? date.getSeconds() : `0${date.getSeconds()}`
    };
    return dateObj;
  }
  const deviceLoop = {
    deviceInfo: () =>
      new Promise((resolve, reject) => {
        device.getInfo({
          success: res => {
            resolve(res);
          }
        });
      }),
    deviceIds: () =>
      new Promise((resolve, reject) => {
        device.getId({
          type: ["device", "mac"],
          success: res => {
            resolve(res);
          },
          fail: (data, code) => {
            console.log(`handling fail, code = ${code}`);
            reject(data);
          }
        });
      }),
    netType: () =>
      new Promise((resolve, reject) => {
        network.getType({
          success: data => {
            resolve(data);
          },
          fail: function() {
            reject();
          }
        });
      })
  };
  function offLineCodes() {
    return Object.keys(config.detail).filter(key => config.detail[key] == 1);
  }
  class APP_LOG {
    constructor() {
      this.self = null;
      this.hapInfo = {};
      this.commonParams = {};
      this.uid = "";
      this.deviceInfo = {};
      this.currentFile = "";
      //每个日志包含两条，，第一条
      this.firstLog = {
        index: {
          _type: "log",
          _id: $utils.randomMid2(),
          _index: `hap-client-${date().y}.${date().M}.${date().d}`
        }
      };
    }
    //初始化注入
    init(t) {
      this.self = t;
      const appInfo = app.getInfo();
      Promise.all([
        deviceLoop.deviceInfo(),
        deviceLoop.deviceIds(),
        deviceLoop.netType()
      ])
        .then(res => {
          this.hapInfo = Object.assign({}, appInfo, ...res);
          const {
            device,
            brand,
            manufacturer,
            type,
            versionCode,
            versionName,
            platformVersionCode
          } = this.hapInfo;
          this.uid = this.self.$def.data.userInfo.uid;
          this.deviceInfo = APP.$deviceInfo.deviceInfo;
          this.commonParams = {
            imei: device,
            uid: this.uid,
            did: device,
            pfm: "hap",
            // versionCode,
            // osversion: platformVersionCode,
            chid: brand,
            // net: type,
            // manufacturer,
            ts: new Date().getTime()
          };
          this.intervalLoop(this.offLoop, config.checkUploadIntervalSec * 1000);
          // setTimeout(() => {
          //   this.actionLog({ comp: 11111 });
          // }, 1500);
        })
        .catch(err => {});
    }
    //定时任务发送离线上报请求
    intervalLoop(cb, interval) {
      const _this = this;
      const e = () => {
        setTimeout(e, interval);
        cb(_this);
      };
      setTimeout(e, initIntervalSec);
    }
    async offLoop(_this) {
      try {
        for (let key of offLineCodes()) {
          const res = await _this._getFileList(`${FILE_PATH}/${key}/`);
          if (res && res.fileList.length > 0) {
            res.fileList.forEach(item => {
              if (!item.uri.includes("temp")) {
                const isExceedDate =
                  new Date().getTime() - item.lastModifiedTime <=
                  config.ttl * 60 * 60 * 1000;
                if (isExceedDate) {
                  _this.offLine({ log_code: key }, item.uri).then(res => {
                    _this._removeLog(item.uri).then(() => {
                      console.log("离线上报成功");
                    });
                  });
                } else {
                  _this._removeLog(item.uri);
                }
              }
            });
          }
        }
      } catch (err) {}
    }
    //1000 行为日志
    actionLog(params) {
      this.codeType(1000, params);
    }
    //3000 网络异常
    netLog(params) {
      this.codeType(3000, params);
    }
    //8000 质量上报
    qaLog(params) {
      this.codeType(8000, params);
    }
    /**
     * 实时上传
     * {
     *    comp 上报事件id
     *    action 操作动作 比如长按，点击。。。
     * }
     */
    realTime(params) {
      const type = "real";
      const obj = Object.assign(this.commonParams, params);
      console.log(obj, "obj");
      return new Promise((resolve, reject) => {
        this._get(type, REAL_API_PATH, obj).then(res => {
          resolve(res);
        });
      });
    }
    //离线上传
    offLine(params, file) {
      const type = "offLine";
      const obj = Object.assign(this.commonParams, params);
      return new Promise((resolve, reject) => {
        this._get(type, OFFLINE_API_PATH, obj, file).then(res => {
          resolve(res);
        });
      });
    }
    //区分不同的log_code
    codeType(code, params) {
      config.detail[code] == 2
        ? this.realTime(params)
        : this._judgeFileSize(
            Object.assign(this.commonParams, params, { log_code: code })
          );
    }
    //error
    onError(err) {
      const errorMsg = err.message;
      const obj = Object.assign(this.commonParams, {
        error: errorMsg,
        log_code: 7000
      });
      this._judgeFileSize(obj);
    }
    //fetch
    _get(type, url, obj, file = "") {
      const commonParams = {
        uid: this.self.$def.data.userInfo.uid,
        deviceId: this.hapInfo.device,
        requestId: $utils.randomMid2()
      };
      url +=
        "?" +
        Object.keys(commonParams)
          .map(key => `${key}=${encodeURIComponent(commonParams[key])}`)
          .join("&");
      let param = {
        url: url,
        method: "POST",
        header: {
          "Content-Type":
            type == "real"
              ? "application/x-www-form-urlencoded"
              : "multipart/form-data",
          "User-Agent-ZX": APP.$deviceInfo.deviceInfo
        }
      };
      if (type == "real") {
        file = `${JSON.stringify(this.firstLog)}\n${JSON.stringify(obj)}`;
        param = Object.assign(param, {
          data: { file, logType: String(obj.log_code) }
        });
        console.log(param);
        return new Promise((resolve, reject) => {
          $fetch
            .fetch(param)
            .then(res => {
              if (
                res.data.code == 200 &&
                res.data.data &&
                JSON.parse(res.data.data).resultCode == 0
              ) {
                console.log("实时日志上报成功");
                console.log(res.data);
                resolve(res.data);
              } else {
                console.log("实时日志上报失败");
                reject();
                this._judgeFileSize(obj);
              }
            })
            .catch(err => {
              console.log("实时日志上报失败");
              reject(err);
              this._judgeFileSize(obj);
            });
        });
      }
      if (type == "offLine") {
        const files = [
          {
            filename: this.getFileName(file),
            uri: file,
            name: "file"
          }
        ];
        const data = [
          {
            name: "logType",
            value: obj.log_code
          }
        ];
        console.log({
          ...param,
          files,
          data
        });
        return new Promise((resolve, reject) => {
          request.upload({
            ...param,
            files,
            data,
            success: function(data) {
              console.log(data);
              console.log("离线文件上传成功");
              resolve(data);
            },
            fail: function(data, code) {
              console.log(`离线文件上传失败 ${data}--${code}`);
            }
          });
        });
      }
    }
    //获取文件名称
    getFileName(uri) {
      const arr = uri.split("/");
      return arr[arr.length - 1];
    }
    //存取最近一次操作的日志并判断文件大小
    _judgeFileSize(data) {
      console.log(data, ".................");
      const { log_code } = data,
        { y, M, d, h, m, s } = date(),
        uri = `${FILE_PATH}/${log_code}/${packageName}.${y}${M}${d}${h}${m}${s}.txt`,
        initLog = { log_code: log_code, currentUri: uri };
      storage.get({ key: "currentLog" }).then(res => {
        console.log(res.data, "currentLog");
        if (!res.data) {
          this._set(uri, [initLog], data);
        } else {
          let logList = JSON.parse(res.data);
          console.log(logList, "logList");
          const isContainCode = logList.some(item => item.log_code == log_code);
          if (isContainCode) {
            const currentLog = logList.filter(
              item => item.log_code == log_code
            );
            const currentUri = currentLog[0].currentUri;
            this._getFile(currentUri)
              .then(r => {
                let newUri = "";
                console.log(log_code, "log_code");
                if (log_code != 7000) {
                  newUri = r.length >= config.maxFileSize ? uri : currentUri;
                  logList.forEach(item => {
                    if (item.log_code == log_code) {
                      item.currentUri = newUri;
                    }
                  });
                } else {
                  newUri = uri;
                }
                this._set(newUri, logList, data);
              })
              .catch(() => {
                logList.splice(
                  logList.findIndex(item => item.currentUri == currentUri),
                  1
                );
                logList.push(initLog);
                this._set(uri, logList, data);
              });
          } else {
            logList.push(initLog);
            this._set(uri, logList, data);
          }
        }
      });
    }
    //更新修改当前log storage
    _set(uri, logs, data) {
      storage
        .set({
          key: "currentLog",
          value: JSON.stringify(logs)
        })
        .then(() => {
          console.log("当前文件uri保存成功");
          this._writeLog(uri, data);
        });
    }
    //写文件
    _writeLog(uri, data = { text: "temp" }) {
      file.writeText({
        uri: uri,
        text: `${JSON.stringify(this.firstLog)}\n${JSON.stringify(data)}`,
        success: () => {
          console.log("成功写入文件");
        },
        file: () => {
          console.log("写入文件出错");
        }
      });
    }
    //读日志
    _readLog() {}
    //获取文件信息
    _getFile(uri) {
      console.log(uri, "uri");
      return new Promise((resolve, reject) => {
        file.get({
          uri: uri,
          success: data => {
            resolve(data);
            console.log("获取文件信息成功");
          },
          fail: (data, code) => {
            reject();
            console.log(`获取文件信息出错,${code}`);
          }
        });
      });
    }
    //获取指定目录下的文件列表
    _getFileList(uri) {
      console.log(uri);
      return new Promise((resolve, reject) => {
        file.list({
          uri: uri,
          success: data => {
            console.log(data);
            console.log("获取文件列表成功");
            resolve(data);
          },
          fail: (data, code) => {
            this._writeLog(`${uri}temp.txt`);
            console.log(`获取文件列表出错 ${data}--${code}`);
            reject();
          }
        });
      });
    }
    //删除过期日志以及上传成功日志
    _removeLog(uri) {
      return new Promise((resolve, reject) => {
        file.delete({
          uri: uri,
          success: () => {
            console.log("删除日志成功");
            resolve();
          },
          fail: () => {
            reject();
          }
        });
      });
    }
  }
  APP.APP_LOG = APP_LOG;
})(global.__proto__ || global);
