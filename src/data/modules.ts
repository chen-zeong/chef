export type ToolMeta = {
  id: string;
  name: string;
  description: string;
  status: "ready" | "soon";
};

export type ModuleMeta = {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: {
    from: string;
    to: string;
  };
  tools: ToolMeta[];
};

export const modules: ModuleMeta[] = [
  {
    id: "encryption",
    name: "编程工具",
    description: "常用编码、解析与调试工具合集。",
    icon: "Braces",
    accent: {
      from: "rgba(110, 142, 255, 0.35)",
      to: "rgba(142, 219, 255, 0.35)"
    },
    tools: [
      {
        id: "json-parser",
        name: "JSON 解析器",
        description: "粘贴 JSON 字符串，一键格式化并校验。",
        status: "ready"
      },
      {
        id: "payload-diff",
        name: "参数对比",
        description: "对比 URL / Cookie / Header 键值差异。",
        status: "ready"
      },
      {
        id: "md5",
        name: "MD5 摘要",
        description: "生成字符串的 MD5 哈希值。",
        status: "ready"
      },
      {
        id: "file-hash",
        name: "文件 Hash",
        description: "选择文件后生成 MD5 / SHA256 摘要。",
        status: "ready"
      },
      {
        id: "base64",
        name: "Base64 编解码",
        description: "快速进行 Base64 加解密。",
        status: "ready"
      },
      {
        id: "aes",
        name: "AES 加密",
        description: "可配置向量与密钥的 AES 工具。",
        status: "ready"
      },
      {
        id: "url-codec",
        name: "URL 编解码",
        description: "快速进行 URL 编码与解码。",
        status: "ready"
      },
      {
        id: "radix-converter",
        name: "进制转换",
        description: "选择进制后快速互转并复制结果。",
        status: "ready"
      },
      {
        id: "time-converter",
        name: "时间转换",
        description: "在 Unix 时间戳、本地/UTC 时间间转换。",
        status: "ready"
      }
    ]
  },
  {
    id: "images",
    name: "图片处理",
    description: "基础调色到转码的图像工具集。",
    icon: "Image",
    accent: {
      from: "rgba(255, 212, 142, 0.22)",
      to: "rgba(255, 244, 174, 0.2)"
    },
    tools: [
      {
        id: "compressor",
        name: "图片压缩",
        description: "无损压缩图像体积，支持批量处理。",
        status: "soon"
      },
      {
        id: "converter",
        name: "格式转换",
        description: "在常见图片格式间互转。",
        status: "soon"
      }
    ]
  },
  {
    id: "system",
    name: "电脑操作",
    description: "常用的本机调试与配置工具。",
    icon: "Monitor",
    accent: {
      from: "rgba(125, 213, 194, 0.28)",
      to: "rgba(118, 167, 246, 0.24)"
    },
    tools: [
      {
        id: "host-manager",
        name: "Host 管理",
        description: "快速切换常用 hosts 条目并导出。",
        status: "ready"
      },
      {
        id: "env-editor",
        name: "环境变量",
        description: "整理环境变量并生成设置脚本。",
        status: "ready"
      },
      {
        id: "stay-awake",
        name: "电脑常亮",
        description: "保持屏幕常亮，避免自动睡眠。",
        status: "ready"
      },
      {
        id: "region-screenshot",
        name: "框选截图",
        description: "启动全屏遮罩，为框选截图交互做准备。",
        status: "ready"
      },
      {
        id: "color-picker",
        name: "取色器",
        description: "调用系统取色器并记录常用颜色。",
        status: "ready"
      },
      {
        id: "file-search",
        name: "全局文件搜索",
        description: "基于 rust_search 的本地文件检索工具。",
        status: "ready"
      }
    ]
  },
  {
    id: "network",
    name: "网络",
    description: "查看 IP / 代理状态并进行局域网分享。",
    icon: "Earth",
    accent: {
      from: "rgba(99, 179, 237, 0.28)",
      to: "rgba(59, 130, 246, 0.22)"
    },
    tools: [
      {
        id: "network-inspector",
        name: "IP 查看",
        description: "查看 IPv4/IPv6、本地网段与 VPN/代理状态。",
        status: "ready"
      },
      {
        id: "network-doctor",
        name: "断网急救",
        description: "检测网络并自动执行代理 / DNS 修复清单。",
        status: "ready"
      },
      {
        id: "lan-share",
        name: "局域网快传",
        description: "选择文件后生成扫码链接，手机即可直接下载。",
        status: "ready"
      }
    ]
  },
  {
    id: "productivity",
    name: "效率工具",
    description: "记录灵感、拆解任务与节奏控管的轻量工作台。",
    icon: "Check",
    accent: {
      from: "rgba(255, 170, 214, 0.32)",
      to: "rgba(255, 214, 150, 0.32)"
    },
    tools: [
      {
        id: "todo",
        name: "待办清单",
        description: "记录任务、设置优先级并获取顺滑动画反馈。",
        status: "ready"
      }
    ]
  },
  {
    id: "icons",
    name: "图标",
    description: "SVG 预览与图标转换。",
    icon: "PenTool",
    accent: {
      from: "rgba(255, 180, 220, 0.26)",
      to: "rgba(255, 214, 150, 0.24)"
    },
    tools: [
      {
        id: "svg-preview",
        name: "SVG 预览",
        description: "粘贴 SVG 代码并即时预览效果。",
        status: "ready"
      },
      {
        id: "icon-converter",
        name: "图片转图标",
        description: "将图片转换为多尺寸图标资源。",
        status: "ready"
      }
    ]
  }
];
