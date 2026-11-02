# createdream · 叠叠狐狸

湖南理工大学南湖创梦空间校园地图编辑器（仓库名与部署域名均为 `createdream`）。

![界面预览](docs/preview.png)

一个可直接部署为静态网页的 2D 校园地图编辑器。地图底板是一张手绘草地贴图，建筑与树木使用抠好的透明位图：砖楼(左)、砖楼(右)、圆形楼、新楼、树木；道路、木桥、田径场与绿地仍为自绘 Canvas 素材。

## 使用

推荐双击 `启动预览.cmd`（或在本目录运行 `python -m http.server 8080`）后访问 `http://127.0.0.1:8080/`；也可以直接双击 `index.html`。Konva.js 已放在 `js/vendor/konva.min.js`，本地运行无需联网。

> 浏览器安全策略：以 `file://` 双击打开时，引用外部图片会污染画布，`导出图片` 会被浏览器拒绝。需要导出含新素材的 PNG 时，请用上面的本地服务器方式打开；直接双击仍可正常编辑、保存布局和导出 JSON。

- 砖楼(左) 与 砖楼(右) 是同一栋楼的两个朝向，默认高度一致，左右并排可拼成更长的教学楼；建筑、树木、田径场等素材可点击或拖入画布，湖面、道路、木桥和自绘区域支持自由轨迹绘制。
- 选中物件后可拖动、旋转、拉伸；检查器支持命名、显示/隐藏浮签、替换内置素材或上传本地图片。自绘区域可调整填色。
- 湖面重叠时自动合成为连续水域，交界处不重复绘制岸线，水色与波纹保持连贯；各块湖面仍可独立拖动、旋转、缩放和撤销。湖面统一位于地形底层，桥梁及建筑不会被新画的湖面覆盖。
- 道路与桥梁按“同类合并”渲染：相接或交叉的路段/桥段会连成一整块，不再出现内部边线，重合处也不会叠加变深；轨迹超出画布的部分在画布边缘被裁掉，不会无限延伸。
- 木桥使用大角度俯视的伪立体绘制，显示桥面侧厚、竖直栏杆立柱、前后遮挡和投影，支持自由弯曲路径；绘制预览与 PNG 导出使用相同效果。
- 地图底板使用 `assets/grass.webp`（1800×1200，183 KB）：已裁掉画纸浅色边缘，横版直接铺满，竖版把同一张位图顺时针旋转 90° 后铺满，不做拉伸变形；载入失败时自动回退到内置手绘底板。
- 建筑与树木改用 `assets/brick-left.webp`、`assets/brick-right.webp`、`assets/round.webp`、`assets/new-building.webp`、`assets/tree.webp`：已扣掉白底与投影、压缩到 560–680px 长边（合计约 306 KB）。布局 JSON 只记录素材类型，不内嵌图片数据；同一素材放多少个都共用一份解码后的位图缓存（`js/assets.js`）。
- 检查器还支持修改尺寸、复制、调整层级和删除。
- 空白处拖动平移，滚轮缩放；“适应”回到完整画布。
- 自动保存在当前浏览器；JSON 布局包含自由路径和替换图片，支持导入导出。
- 高清 PNG 采用「圆角地图卡片 + 浅蓝天空 + 白云边框」的版式，左上角放透明底圆形校徽（默认已内置学校校徽），左下角合成指南针；页面背景同样是天空色，地图四周有云朵环绕。
- 画布可在竖版与横版之间切换：切换时按“整版等比适配”缩放布局，切回原方向会按记录的反向变换精确还原，反复切换不会越切越小；左上角标识支持上传替换；指南针固定为上方朝南。

## 技术参考

- [Konva.js](https://github.com/konvajs/konva)：Canvas 场景、拖动与 Transformer 交互。
- [Konva Select and Transform 示例](https://konvajs.org/docs/select_and_transform/Basic_demo.html)：选中、缩放、旋转的交互参考。
- 项目采用自绘 Canvas 素材与 DOM 浮签，布局数据保存在浏览器 localStorage；地图内容仅保存在当前浏览器。

## 发布

将本目录完整发布到任意静态托管服务即可。入口为 `index.html`，无需构建步骤。

线上地址：<https://createdream.pages.dev>（Cloudflare Pages 项目 `createdream`）

### 自动部署（GitHub Actions）

推送到 `main` 会自动构建并发布：`.github/workflows/deploy-pages.yml` 会把运行时文件（`index.html`、`styles.css`、`_headers`、`js/`、`assets/`、`docs/`）复制到 `dist/`，再用 `wrangler pages deploy` 上传。

首次使用需要在仓库 **Settings → Secrets and variables → Actions** 里加一个 secret：

- `CLOUDFLARE_API_TOKEN`：Cloudflare → My Profile → API Tokens → Create Token → Custom token，权限 **Account · Cloudflare Pages · Edit**（Account ID 已内置，不需要单独配置）

加完在 Actions 里手动跑一次，或直接 push 触发。

## 开发验证

运行时仍为纯静态网页；下列离屏回归测试仅在开发时使用 Node.js 与可选的 `canvas` 模块：

```sh
node tests/render-regression.cjs /absolute/path/to/node_modules/canvas
node tests/app-regression.cjs /absolute/path/to/node_modules/canvas
node tests/asset-regression.cjs /absolute/path/to/node_modules/canvas
node tests/path-regression.cjs /absolute/path/to/node_modules/canvas
```

测试会用到的 PNG 基准图放在 `tests/fixtures/`；运行产物写到 `tests/artifacts/`（已加入 `.gitignore`）。

覆盖水域内部无岸线、叠放顺序、分离湖面、岛屿留白、旋转缩放、删除与缓存恢复；真实 Konva 图层下的复制、点击层级、键盘移动、撤销重做、素材替换、横竖屏切换和高清 PNG 导出；以及素材缓存只解码一次、批量预载去重、订阅回调和加载失败降级。

> 回归测试中的 `canvas` 模块无法解码 WebP，`tests/fixtures/*-probe.png` 是仅供测试读取的 PNG 副本，运行时不使用。
