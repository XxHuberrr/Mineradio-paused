param(
  [Parameter(Mandatory = $true)]
  [long]$HostWindow,

  [Parameter(Mandatory = $true)]
  [long]$SourceWindow
)

$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing') -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class MineradioDwmThumbnailProbe : Form {
  [StructLayout(LayoutKind.Sequential)]
  private struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct DWM_THUMBNAIL_PROPERTIES {
    public uint dwFlags;
    public RECT rcDestination;
    public RECT rcSource;
    public byte opacity;
    [MarshalAs(UnmanagedType.Bool)] public bool fVisible;
    [MarshalAs(UnmanagedType.Bool)] public bool fSourceClientAreaOnly;
  }

  private const uint DWM_TNP_RECTDESTINATION = 0x00000001;
  private const uint DWM_TNP_OPACITY = 0x00000004;
  private const uint DWM_TNP_VISIBLE = 0x00000008;
  private const uint DWM_TNP_SOURCECLIENTAREAONLY = 0x00000010;
  private const uint SWP_NOACTIVATE = 0x0010;
  private const uint SWP_SHOWWINDOW = 0x0040;
  private const int WS_EX_TRANSPARENT = 0x00000020;
  private const int WS_EX_TOOLWINDOW = 0x00000080;
  private const int WS_EX_NOACTIVATE = 0x08000000;
  private const int WM_NCHITTEST = 0x0084;
  private const int HTTRANSPARENT = -1;

  [DllImport("user32.dll")]
  private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  private static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool SetWindowPos(
    IntPtr hWnd,
    IntPtr hWndInsertAfter,
    int x,
    int y,
    int width,
    int height,
    uint flags);

  [DllImport("dwmapi.dll")]
  private static extern int DwmRegisterThumbnail(
    IntPtr destination,
    IntPtr source,
    out IntPtr thumbnail);

  [DllImport("dwmapi.dll")]
  private static extern int DwmUpdateThumbnailProperties(
    IntPtr thumbnail,
    ref DWM_THUMBNAIL_PROPERTIES properties);

  [DllImport("dwmapi.dll")]
  private static extern int DwmUnregisterThumbnail(IntPtr thumbnail);

  private readonly IntPtr hostWindow;
  private readonly IntPtr sourceWindow;
  private readonly Timer followTimer;
  private IntPtr thumbnail = IntPtr.Zero;

  public MineradioDwmThumbnailProbe(IntPtr host, IntPtr source) {
    hostWindow = host;
    sourceWindow = source;
    FormBorderStyle = FormBorderStyle.None;
    ShowInTaskbar = false;
    StartPosition = FormStartPosition.Manual;
    BackColor = Color.Black;
    Text = "Mineradio WE DWM Surface Probe";
    followTimer = new Timer();
    followTimer.Interval = 33;
    followTimer.Tick += delegate { FollowHost(); };
  }

  protected override bool ShowWithoutActivation { get { return true; } }

  protected override CreateParams CreateParams {
    get {
      CreateParams parameters = base.CreateParams;
      parameters.ExStyle |= WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT;
      return parameters;
    }
  }

  protected override void WndProc(ref Message message) {
    if (message.Msg == WM_NCHITTEST) {
      message.Result = new IntPtr(HTTRANSPARENT);
      return;
    }
    base.WndProc(ref message);
  }

  protected override void OnShown(EventArgs eventArgs) {
    base.OnShown(eventArgs);
    int result = DwmRegisterThumbnail(Handle, sourceWindow, out thumbnail);
    if (result != 0 || thumbnail == IntPtr.Zero) {
      throw new InvalidOperationException("DwmRegisterThumbnail failed: 0x" + result.ToString("X8"));
    }
    FollowHost();
    followTimer.Start();
    Console.WriteLine("DWM_THUMBNAIL_READY " + Handle.ToInt64());
    Console.Out.Flush();
  }

  protected override void OnFormClosed(FormClosedEventArgs eventArgs) {
    followTimer.Stop();
    if (thumbnail != IntPtr.Zero) {
      DwmUnregisterThumbnail(thumbnail);
      thumbnail = IntPtr.Zero;
    }
    base.OnFormClosed(eventArgs);
  }

  private void FollowHost() {
    if (!IsWindow(hostWindow) || !IsWindow(sourceWindow)) {
      Close();
      return;
    }
    RECT hostRect;
    if (!GetWindowRect(hostWindow, out hostRect)) return;
    int width = Math.Max(1, hostRect.Right - hostRect.Left);
    int height = Math.Max(1, hostRect.Bottom - hostRect.Top);

    // The probe is immediately behind Mineradio. The real WE source remains
    // aligned one z-order level further back so it receives the same global
    // cursor geometry without ever covering or receiving Mineradio clicks.
    SetWindowPos(Handle, hostWindow, hostRect.Left, hostRect.Top, width, height,
      SWP_NOACTIVATE | SWP_SHOWWINDOW);
    SetWindowPos(sourceWindow, Handle, hostRect.Left, hostRect.Top, width, height,
      SWP_NOACTIVATE | SWP_SHOWWINDOW);

    DWM_THUMBNAIL_PROPERTIES properties = new DWM_THUMBNAIL_PROPERTIES();
    properties.dwFlags = DWM_TNP_RECTDESTINATION
      | DWM_TNP_OPACITY
      | DWM_TNP_VISIBLE
      | DWM_TNP_SOURCECLIENTAREAONLY;
    properties.rcDestination = new RECT { Left = 0, Top = 0, Right = width, Bottom = height };
    properties.opacity = 255;
    properties.fVisible = true;
    properties.fSourceClientAreaOnly = true;
    int result = DwmUpdateThumbnailProperties(thumbnail, ref properties);
    if (result != 0) {
      throw new InvalidOperationException("DwmUpdateThumbnailProperties failed: 0x" + result.ToString("X8"));
    }
  }

  public static void Run(long host, long source) {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Application.Run(new MineradioDwmThumbnailProbe(new IntPtr(host), new IntPtr(source)));
  }
}
'@

[MineradioDwmThumbnailProbe]::Run($HostWindow, $SourceWindow)
