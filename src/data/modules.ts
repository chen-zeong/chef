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
    id: "json",
    name: "JSON 工具",
    description: "快速解析、格式化与校验 JSON 数据。",
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
      }
    ]
  },
  {
    id: "encryption",
    name: "加密",
    description: "经典算法与现代加密工具集合。",
    icon: "Shield",
    accent: {
      from: "rgba(247, 173, 248, 0.22)",
      to: "rgba(239, 209, 255, 0.18)"
    },
    tools: [
      {
        id: "md5",
        name: "MD5 摘要",
        description: "生成字符串的 MD5 哈希值。",
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
