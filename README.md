# 机械设计基础自测题库 (Mechanical Design Quiz)

[![Netlify Status](https://api.netlify.com/api/v1/badges/b2c04d35-aa6e-002721b7d1bf/deploy-status)](https://app.netlify.com/sites/mechanicdesign/deploys)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

一个现代化的、响应式的机械设计基础课程自测刷题 Web 应用。专为浙江大学学生期末复习设计，提供丰富的题库和多种练习模式。

👉 **在线体验**: [https://mechanicdesign.netlify.app/](https://mechanicdesign.netlify.app/)

## ✨ 主要功能

### 1. 多模式刷题
- **章节练习**: 按章节分类浏览题目，支持选择题和判断题。
- **模拟考试**: 随机抽取 30 道选择题和 20 道判断题，限时 20 分钟模拟真实考试环境。
- **综合测试**: 针对所有章节的选择题或判断题进行随机抽查。
- **错题重练**: 自动记录你的错题，支持针对特定章节或所有错题进行强化训练。

### 2. 增强的学习体验
- **即时反馈**: 提交答案后立即显示正误，并提供详细的**Markdown 解析**。
- **公式支持**: 内置 MathJax 引擎，完美渲染题目和解析中的数学公式。
- **键盘快捷键**:
    - `A/B/C/D` 或 `1/2/3/4`: 选择选项
    - `T/F`: 判断题选择 (True/False)
    - `Enter`: 提交/下一题
    - `Space`: 跳过当前题/下一题
- **收藏夹**: 遇到重点难点题目，一键收藏，随时回顾。

### 3. 数据与个性化
- **学习仪表盘**: 可视化展示你的刷题进度、正确率和各章节掌握情况。
- **随手记**: 右侧边栏内置笔记本，自动保存你的笔记，支持导出为 TXT 文件。
- **数据同步**: 支持导出/导入所有学习数据（收藏、错题、笔记、统计），方便多设备切换。
- **黑暗模式**: 内置护眼深色模式，随心切换。
- **自定义壁纸**: 支持上传并裁剪图片作为背景壁纸，打造个性化学习界面（带有毛玻璃效果）。

### 4. 现代化 UI/UX
- **响应式设计**: 完美适配桌面端、平板和手机端。
- **极简风格**: 界面清爽无广告，专注于学习体验。
- **平滑动画**: 细腻的交互动画，提升使用愉悦感。

## 🛠️ 技术栈

本项目是一个纯前端静态应用，无需后端数据库支持。

- **核心**: HTML5, CSS3, JavaScript (ES6+)
- **图标**: Font Awesome
- **字体**: Google Fonts (Inter, Noto Sans SC)
- **数学渲染**: MathJax
- **Markdown 渲染**: Marked.js
- **图片裁剪**: Cropper.js

## 🚀 本地运行

无需复杂的安装过程，只需通过静态服务器即刻运行。

1. **克隆项目**
   ```bash
   git clone https://github.com/your-username/mech-design-quiz.git
   ```

2. **运行**
   - 方式一：使用 VS Code 的 **Live Server** 插件右键 `index.html` 打开。
   - 方式二：使用 Python 快速启动：
     ```bash
     python -m http.server
     ```
   - 方式三：直接在浏览器中打开 `index.html` (部分功能如图片裁剪可能会受浏览器安全策略限制，建议使用本地服务器)。

## 📂 部署

本项目可以直接部署到任何静态网站托管服务，如 Netlify, Vercel,或是 GitHub Pages。

**Netlify 部署步骤:**
1. 将项目文件夹拖入 Netlify Drop 区域。
2. 或者连接你的 GitHub 仓库，能够实现自动持续部署。
3. 无需 Build 命令，发布目录设为根目录 `/` 即可。

## 📝 待办事项 / 开发计划

- [ ] 引入更详细的知识点标签

## 🤝 贡献与反馈

欢迎提交 Issue 或 Pull Request 来改进这个项目！

---
Designed with ❤️ for Mechanical Engineering Students.
