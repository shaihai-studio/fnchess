# 函数棋 — 资产（Assets）版权声明

> 本声明与 `files/` 目录的实际内容一一对应（函数棋 v2.0.0.1）。

## 音效与背景音乐

- `sounds/` 目录共 **7 个音效**（button_push、computer_error、door_bell、
  glass、snap、tap、water_droplet）— **Shaihai Studio 自创素材**。
- `bgm/` 目录共 **6 首背景音乐**（bgm1 ~ bgm6）— **Shaihai Studio 自创素材**。

以上均为 Shaihai Studio 原创，随主程序按 AGPL v3 许可证发布。

## 图片资源

以下均为 **Shaihai Studio 原创**：

- `images/MainTitle.png`（主标题图）、`images/StartButton.png`（开始按钮）、
  `images/VolumeButton.png`（音量按钮）、`images/championship.png`（冠军/锦标赛图标）。
- `images/rank_*.png` 共 **9 个段位图标**（按位阶由低到高）：
  rank_meteoroid（流星体）、rank_asteroid（小行星）、rank_dwarf_planet（矮行星）、
  rank_planet（行星）、rank_star（恒星）、rank_dwarf_galaxy（矮星系）、
  rank_galaxy（星系）、rank_galaxy_cluster（星系团）、rank_universe（宇宙）。
- `Summa形象处理/summa_image/*.png` 共 **9 个 Summa 表情立绘**：
  angry、determined、exhausted、happy、neutral、sad、smug、surprised、thinking。

## 字体

`fonts/SmileySans-Oblique.otf.woff2`、`fonts/SmileySans-Oblique.ttf.woff2` — **得意黑 (SmileySans)**
Copyright (c) 2023, atyunsine <jingyuminn@outlook.com>
SIL Open Font License v1.1 — 可自由使用、修改和分发，不得单独售卖字体文件。
项目地址: https://github.com/atelier-anchor/SmileySans

## 第三方代码

`files/geogebra-lite/` — **geogebra-lite 曲线绘制引擎**
改编自 [GeoGebra](https://www.geogebra.org/) 开源项目（GNU General Public License v3）
的绘图算法（Cohen-Sutherland 裁剪 + 自适应采样 + 曲线折线段绘制）。
按照 GPL v3 条款，本项目的 AGPL v3 许可证与 GPL v3 兼容。

`files/vendor/katex/` — **KaTeX 数学排版引擎**
Copyright (c) Khan Academy，MIT License。
本地离线分发（`katex.min.js` + `katex.min.css` + `fonts/` 字体子目录），
用于表达式数学公式实时排版。

`files/vendor/peerjs/peerjs.min.js` — **PeerJS 库**
MIT License — 用于 WebRTC 点对点联机，作为 CDN 加载失败时的本地回退。

---

**自托管信令服务器**（express / peer / ws，均 MIT License）：
仅在自部署 PeerJS 信令服务器时需要，**不随玩家发布包分发**（本发布包内不含 server/）。

---

**主程序代码**: GNU Affero General Public License v3 — 详见 LICENSE 文件。

**联系方式**: https://space.bilibili.com/3690976753223882
