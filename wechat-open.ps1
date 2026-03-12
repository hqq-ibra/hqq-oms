param([string]$rawInput)

if (-not $rawInput) { exit }

$wechatId = $rawInput -replace '"','' -replace '^hqqwechat:/+','' -replace '[/\\]+$','' -replace '\s',''

if (-not $wechatId) { exit }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -Language CSharp @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class WeChatWin {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    public static IntPtr FindWeChatWindow() {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            StringBuilder title = new StringBuilder(256);
            GetWindowText(hWnd, title, 256);
            string t = title.ToString();
            if (t == "WeChat" || t.Contains("\u5FAE\u4FE1")) {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static void BringToFront(IntPtr hWnd) {
        ShowWindow(hWnd, 9);
        SetForegroundWindow(hWnd);
    }

    public static bool IsForeground(IntPtr hWnd) {
        return GetForegroundWindow() == hWnd;
    }
}
"@

Set-Clipboard -Value $wechatId

$hwnd = [WeChatWin]::FindWeChatWindow()

if ($hwnd -eq [IntPtr]::Zero) {
    $wechatPath = $null

    $commonPaths = @(
        "C:\Program Files\Tencent\Weixin\Weixin.exe",
        "$env:ProgramFiles\Tencent\Weixin\Weixin.exe",
        "${env:ProgramFiles(x86)}\Tencent\Weixin\Weixin.exe",
        "$env:LOCALAPPDATA\Programs\Tencent\Weixin\Weixin.exe"
    )
    foreach ($cp in $commonPaths) {
        if (Test-Path $cp) { $wechatPath = $cp; break }
    }

    if (-not $wechatPath) { exit }

    Start-Process -FilePath $wechatPath

    $timeout = 30
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 1
        $elapsed++
        $hwnd = [WeChatWin]::FindWeChatWindow()
        if ($hwnd -ne [IntPtr]::Zero) { break }
    }

    if ($hwnd -eq [IntPtr]::Zero) { exit }

    Start-Sleep -Seconds 2
}

[WeChatWin]::BringToFront($hwnd)
Start-Sleep -Milliseconds 500

if (-not [WeChatWin]::IsForeground($hwnd)) {
    [WeChatWin]::BringToFront($hwnd)
    Start-Sleep -Milliseconds 300
}

# Only send keys if WeChat is actually in the foreground
if ([WeChatWin]::IsForeground($hwnd)) {
    [System.Windows.Forms.SendKeys]::SendWait("^f")
    Start-Sleep -Milliseconds 300

    if ([WeChatWin]::IsForeground($hwnd)) {
        [System.Windows.Forms.SendKeys]::SendWait("^a")
        Start-Sleep -Milliseconds 50
        [System.Windows.Forms.SendKeys]::SendWait("^v")
        
        # Wait for search results to load
        Start-Sleep -Milliseconds 800

        # Only press Enter if WeChat is STILL the foreground window
        # This prevents accidental sends if user clicked elsewhere
        if ([WeChatWin]::IsForeground($hwnd)) {
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        }
    }
}
