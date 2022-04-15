## 快应用，日志上报方案 包括 实时 离线 crash收集 pageShow pageHide

### 日志上报整体设计
<img width="942" alt="image" src="https://user-images.githubusercontent.com/18510481/163556242-c709ab18-b160-47c5-8e33-103b5a92c179.png">

### 初始化注入

在 ```app.ux```生命周期``` onCreate```注入```APP_LOG.init(this)```

### crash收集

在 ```app.ux onError```应用错误error事件中注入```APP_LOG.onError(err)```,捕获应用错误

### 监控页面进入，退出

在```.ux```文件```script```标签中导出```Custom_page```,```export default Custom_page({....})```
