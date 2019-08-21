## 快应用，日志上报方案 包括 实时 离线 crash收集 pageShow pageHide


### 初始化注入

在 ```app.ux```生命周期``` onCreate```注入```APP_LOG.init(this)```

### crash收集

在 ```app.ux onError```应用错误error事件中注入```APP_LOG.onError(err)```,捕获应用错误

### 监控页面进入，退出

在```.ux```文件```script```标签中导出```Custom_page```,```export default Custom_page({....})```
