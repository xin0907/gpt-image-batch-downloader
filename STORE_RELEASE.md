# Chrome Web Store 发布准备

本扩展由个人独立开发，并非 OpenAI 官方产品。商店展示名称使用“图片批量下载助手 for ChatGPT”/“Image Batch Downloader for ChatGPT”。按 OpenAI 品牌规则和商店防冒充政策，“ChatGPT”只以“for ChatGPT”的形式说明兼容的网站，不作为产品名本身，也不要改成“ChatGPT 下载器”“XxxGPT”这类名称。

## 可上传的文件

1. 如需重新生成图标及宣传图，先安装 Pillow，再运行 `python scripts/generate_artwork.py`。仓库中已经包含生成好的 PNG，普通打包无需安装 Pillow。
2. 运行 `node --test tests/*.cjs`，再运行 `python scripts/package.py`。
3. 上传 `release/image-batch-download-0.8.1.zip`。压缩包根目录已有 `manifest.json`；不要再把整个项目文件夹压缩一次。

商店素材：`icons/icon-128.png` 为 128×128 PNG 图标；`store-assets/promo-440x280.png` 为 440×280 小宣传图。还需要在扩展实际运行的 ChatGPT 页面拍摄至少一张真实截图，尺寸为 1280×800 或 640×400。建议展示选图面板，以及全屏查看器内的按钮。截图应去掉不愿公开的对话或账号信息；不要把模拟页面截图当成真实功能截图。

## 商店文案草稿

名称和简短说明来自 `_locales/`：默认语言为英文（`en`），简体中文浏览器显示 `zh_CN`。商店后台的详细说明和截图需要按语言分别填写：先填英文（默认语言），再添加简体中文。

**名称**：图片批量下载助手 for ChatGPT / Image Batch Downloader for ChatGPT

**简短说明**：读取当前 ChatGPT 图片组，在本机预览并保存所选图片；不上传开发者服务器。 / Preview and batch save the current ChatGPT image group to a local folder. Nothing is uploaded to the developer.

**详细说明**：

> 数据使用：扩展读取当前 ChatGPT 图片组的图片地址及图片内容，用于预览和用户主动保存；语言偏好保存在浏览器本地。图片不会发送给开发者服务器。详细说明见隐私政策。
>
> 在 ChatGPT 的图片生成结果页或全屏图片查看器中，点击页面内的下载图标，查看当前图片组。图片默认全选；可以单独取消、全选、全不选，也可以点缩略图查看大图。点击“下载已选”后选择本地目录。扩展并行保存所选图片，显示逐张进度，支持失败重试，并避免覆盖同名文件。
>
> 扩展从网页提供的图片地址获取文件字节，不额外压缩图片。网页结构变化、图片链接失效或权限不足时，部分图片可能无法读取；扩展会提示重试。它不承诺与 ChatGPT 原生下载文件逐字节相同。
>
> 界面支持中文和 English。语言偏好保存在浏览器本地。
>
> 本扩展是独立项目，与 OpenAI 没有隶属、赞助或官方认可关系。

**English description** (if adding an English listing):

> Data use: The extension reads image URLs and image data in the current ChatGPT image group for local preview and user-initiated saving. It stores only the language preference locally and does not send images to a developer-operated server. Open the in-page selector from a generated image result or the fullscreen image viewer. All images are selected by default; preview, deselect, or select all, then choose a local folder when you click Download. The extension shows per-image progress, supports retry, and avoids overwriting existing filenames. It does not recompress the received image bytes. It is an independent project and is not affiliated with or endorsed by OpenAI.

## Privacy practices 表单草稿

- **单一用途**：让用户在 ChatGPT 当前图片组中预览、选择并批量保存图片到用户选定的本地目录。
- **`storage`**：仅保存中文或英文界面偏好。
- **`chatgpt.com` / `chat.openai.com`**：识别当前图片组、显示选择器，并在需要时请求网页提供的图片。
- **`*.oaiusercontent.com` / `*.oaistatic.com`**：在页面请求失败时，请求 ChatGPT 图片资源域名上的图片文件。后台只接受来自 ChatGPT 页面、且目标属于这些允许域名的请求。
- **远程代码**：不执行远程代码；网页图片是数据资源，不作为代码执行。
- **数据处理**：读取当前页面的图片元素、图片地址和图片组信息；获取用户所选图片的字节并写入所选本地目录；只在本地保存语言偏好。没有开发者服务器、遥测、广告或用户画像。这里仍应如实申报“网站内容/资源”的处理，不能因只在本机使用就填成完全不处理用户数据。
- **隐私政策网址**：把仓库的 `PRIVACY.md` 发布到公开、稳定可访问的网页，再将该网页地址填入商店后台。后台申报应与该文件和代码一致。

## 提交流程

1. 准备 Google 账号，启用两步验证，到 [Chrome Web Store 开发者后台](https://chrome.google.com/webstore/devconsole) 注册并支付一次性注册费。
2. 创建新扩展，上传上面的 ZIP。在 **Store listing** 填说明、分类、语言、图标对应的宣传素材和真实截图。
3. 在 **Privacy** 填单一用途、权限理由、数据处理情况和隐私政策网址；在 **Distribution** 选择公开范围和地区。有需要时添加审核人员的测试说明。
4. 自己先用“加载已解压的扩展程序”在真实 ChatGPT 页面测试生成结果页、全屏查看器、部分选择、目录选择、失败重试，再点击 **Submit for Review**。可以在审核通过后再手动发布。
5. 以后更新代码或扩展资源时，先把 `manifest.json` 的版本号调高，重新运行打包脚本并上传新 ZIP。

GitHub 仓库包含源码、文档、图标、README 演示截图和赞赏码（赞赏码只在 README 展示，不打进扩展安装包）；不要上传 `release/`、`debug.log`、登录信息或含私人对话的截图。`LICENSE` 中的署名当前为 `xin`，如需使用其他公开署名，应在发布前修改。

官方参考：[准备扩展](https://developer.chrome.com/docs/webstore/prepare)、[上传和提交](https://developer.chrome.com/docs/webstore/publish)、[商店图片尺寸](https://developer.chrome.com/docs/webstore/images)、[隐私表单](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[代码可读性](https://developer.chrome.com/docs/webstore/program-policies/code-readability)。
