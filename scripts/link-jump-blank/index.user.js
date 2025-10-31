// ==UserScript==
// @name         Open all links in new tab
// @namespace    http://tampermonkey.net/
// @version      0.0.4
// @description  Force all links to open in a new tab with domain-specific toggle
// @author       You
// @match        *://*/*
// @icon         https://www.svgrepo.com/show/207466/blank-page-list.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @downloadURL  https://raw.githubusercontent.com/AvailableForTheWorld/Tampermonkey/master/scripts/link-jump-blank/index.user.js
// @updateURL    https://raw.githubusercontent.com/AvailableForTheWorld/Tampermonkey/master/scripts/link-jump-blank/index.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 获取当前域名
    const currentDomain = window.location.hostname;

    // 检查当前域名是否被禁用
    const disabledDomains = GM_getValue('disabledDomains', {});
    const isDisabled = disabledDomains[currentDomain];

    // 注册菜单命令
    registerMenuCommands();

    // 如果当前域名未禁用，则处理链接
    if (!isDisabled) {
        processLinks();
        setupMutationObserver();
    }

    function registerMenuCommands() {
        const disabledDomains = GM_getValue('disabledDomains', {});
        const isDisabled = disabledDomains[currentDomain];

        // 注册切换当前域名状态的菜单命令
        if (isDisabled) {
            GM_registerMenuCommand(`✓ Enable on ${currentDomain}`, function() {
                toggleCurrentDomain(false);
                // 刷新页面使更改生效
                window.location.reload();
            });
        } else {
            GM_registerMenuCommand(`✗ Disable on ${currentDomain}`, function() {
                toggleCurrentDomain(true);
                // 刷新页面使更改生效
                window.location.reload();
            });
        }

        // 注册管理所有域名的菜单命令
        GM_registerMenuCommand('📋 Manage domain settings', showDomainManager);
    }

    function toggleCurrentDomain(disable) {
        const disabledDomains = GM_getValue('disabledDomains', {});

        if (disable) {
            // 禁用当前域名
            disabledDomains[currentDomain] = true;
            GM_setValue('disabledDomains', disabledDomains);
        } else {
            // 启用当前域名
            delete disabledDomains[currentDomain];
            GM_setValue('disabledDomains', disabledDomains);
        }
    }

    function processLinks() {
        const links = document.getElementsByTagName('a');
        for (let i = 0; i < links.length; i++) {
            // 避免修改已经设置了的target属性
            if (!links[i].target || links[i].target === '_self') {
                links[i].target = '_blank';
            }
        }
    }

    function setupMutationObserver() {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'A') {
                            if (!node.target || node.target === '_self') {
                                node.target = '_blank';
                            }
                        } else if (node.querySelectorAll) {
                            const newLinks = node.querySelectorAll('a');
                            newLinks.forEach(function(link) {
                                if (!link.target || link.target === '_self') {
                                    link.target = '_blank';
                                }
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function showDomainManager() {
        const disabledDomains = GM_getValue('disabledDomains', {});
        const domains = Object.keys(disabledDomains);

        if (domains.length === 0) {
            alert('当前没有禁用的域名');
            return;
        }

        let message = '已禁用的域名:\n\n';
        domains.forEach(domain => {
            message += `• ${domain}\n`;
        });
        message += '\n要启用某个域名，请访问该网站并使用菜单中的启用选项。';

        alert(message);
    }

})();