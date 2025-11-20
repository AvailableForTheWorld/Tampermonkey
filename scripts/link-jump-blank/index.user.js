// ==UserScript==
// @name         在新标签页打开链接（可取消 + 聚焦新页）
// @namespace    http://tampermonkey.net/
// @version      0.0.9
// @description  强制所有链接和 SPA 路由在新标签页打开并立即聚焦，新页面获得焦点，当前页保持不动。支持按域名禁用。
// @author       AvailableForTheWorld + Grok
// @match        *://*/*
// @icon         https://www.svgrepo.com/show/207466/blank-page-list.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @downloadURL  https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// @updateURL    https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// ==/UserScript==

;(function () {
  'use strict'

  // 如果是由本脚本打开的新标签页，直接退出，避免干扰
  if (sessionStorage.getItem('openedByScript') === 'true') {
    sessionStorage.removeItem('openedByScript')
    return
  }

  const currentDomain = window.location.hostname
  const disabledDomains = GM_getValue('disabledDomains', {})
  const isDisabled = !!disabledDomains[currentDomain]

  // === 防重复打开逻辑 ===
  let lastOpenTime = 0
  let lastOpenUrl = ''
  let lastTriggerTime = 0

  function safeOpenInTab(url, options = {}) {
    const now = Date.now()
    if (now - lastOpenTime < 2000 && url === lastOpenUrl) {
      console.log('【新标签页脚本】拦截重复打开:', url)
      return
    }
    lastOpenTime = now
    lastOpenUrl = url

    // 默认立即聚焦新标签页
    const finalOptions = { active: true, ...options }
    GM_openInTab(url, finalOptions)
  }

  // === 注册菜单 ===
  function registerMenuCommands() {
    const isDisabledNow = !!GM_getValue('disabledDomains', {})[currentDomain]
    if (isDisabledNow) {
      GM_registerMenuCommand(`✅ 在此网站启用“新标签页打开”`, () =>
        toggleCurrentDomain(false)
      )
    } else {
      GM_registerMenuCommand(`❌ 在此网站禁用“新标签页打开”`, () =>
        toggleCurrentDomain(true)
      )
    }
    GM_registerMenuCommand('📋 查看已禁用的网站', showDomainManager)
  }

  function toggleCurrentDomain(disable) {
    const obj = GM_getValue('disabledDomains', {})
    if (disable) obj[currentDomain] = true
    else delete obj[currentDomain]
    GM_setValue('disabledDomains', obj)
    if (
      confirm(`${disable ? '已禁用' : '已启用'}，需要刷新页面生效。现在刷新？`)
    ) {
      location.reload()
    }
  }

  function showDomainManager() {
    const list = Object.keys(GM_getValue('disabledDomains', {}))
    if (list.length === 0) return alert('没有禁用的网站')
    alert(
      '已禁用的网站：\n\n• ' +
        list.join('\n• ') +
        '\n\n访问对应网站后可重新启用。'
    )
  }

  registerMenuCommands()

  // 如果当前域名被禁用，直接结束
  if (isDisabled) return

  // === 1. 强制普通链接在新标签页打开（并观察动态添加的链接）===
  function setTargetBlank(node) {
    if (node.tagName === 'A' && (!node.target || node.target === '_self')) {
      node.target = '_blank'
      node.rel = 'noopener noreferrer' // 安全 + 性能
    }
  }

  function processLinks() {
    document.querySelectorAll('a').forEach(setTargetBlank)
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return
        setTargetBlank(node)
        if (node.querySelectorAll)
          node.querySelectorAll('a').forEach(setTargetBlank)
      })
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  processLinks()

  // === 2. 拦截 SPA 路由（pushState / hashchange）并在新标签页打开 + 聚焦 ===
  const origPushState = history.pushState
  const origReplaceState = history.replaceState

  history.pushState = function (state, title, url) {
    if (!url || typeof url !== 'string')
      return origPushState.apply(this, arguments)

    let fullUrl = url
    try {
      fullUrl = new URL(url, location.href).href
    } catch {}

    if (fullUrl === location.href) return origPushState.apply(this, arguments)
    if (Date.now() - lastTriggerTime < 2000) return

    lastTriggerTime = Date.now()
    sessionStorage.setItem('openedByScript', 'true')
    setTimeout(() => safeOpenInTab(fullUrl, { active: true }), 50)

    console.log('【新标签页脚本】拦截 pushState → 新标签页打开并聚焦:', fullUrl)
    // 不调用 origPushState → 当前页彻底不动
  }

  history.replaceState = function (state, title, url) {
    // replaceState 通常只是清理参数，不视为新页面，允许原样执行
    return origReplaceState.apply(this, arguments)
  }

  window.addEventListener('hashchange', (e) => {
    if (Date.now() - lastTriggerTime < 2000) return
    lastTriggerTime = Date.now()
    sessionStorage.setItem('openedByScript', 'true')
    setTimeout(() => safeOpenInTab(e.newURL, { active: true }), 50)
    console.log('【新标签页脚本】hashchange → 新标签页打开并聚焦:', e.newURL)
  })

  // === 3. 拦截 window.open（部分网站使用）===
  const origOpen = window.open
  window.open = function (url, name, features) {
    if (typeof url === 'string' && url) {
      let fullUrl = url
      try {
        fullUrl = new URL(url, location.href).href
      } catch {}
      if (fullUrl !== location.href) {
        sessionStorage.setItem('openedByScript', 'true')
        safeOpenInTab(fullUrl, { active: true })
        return null // 模拟打开成功
      }
    }
    return origOpen.apply(this, arguments)
  }

  console.log(
    '【新标签页强制脚本】已激活（聚焦新页模式） - 当前域名:',
    currentDomain
  )
})()
