!include MUI2.nsh
!include "${NSISDIR}\Contrib\Language files\SimpChinese.nsh"

; ============================================
;  页面头部横幅 (非原版 NSIS 外观关键)
; ============================================
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${BUILD_RESOURCES_DIR}\installer-header.bmp"
!define MUI_HEADERIMAGE_UNINSTALL_BITMAP "${BUILD_RESOURCES_DIR}\uninstaller-header.bmp"
!define MUI_HEADERIMAGE_RIGHT

; ============================================
;  现代配色方案 (紫蓝渐变主题)
; ============================================
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "37474F"
!define MUI_PROGRESSBAR_COLOR "7B1FA2"
!define MUI_PROGRESSBAR_BGCOLOR "F3E5F5"
!define MUI_WELCOMEFINISHPAGE_BGCOLOR "FAFAFA"

; ============================================
;  自定义欢迎页文案
; ============================================
!define MUI_WELCOMEFINISHPAGE_TITLE "欢迎安装 ${PRODUCT_NAME}"
!define MUI_WELCOMEFINISHPAGE_TEXT "安装向导将引导您完成安装过程。$\r$\n$\r$\n点击「下一步」继续，或点击「取消」退出安装。"

; ============================================
;  自定义完成页文案
; ============================================
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} 已成功安装到您的电脑。$\r$\n$\r$\n点击「完成」结束安装。"
