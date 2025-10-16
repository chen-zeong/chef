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
        status: "soon"
      },
      {
        id: "aes",
        name: "AES 对称加密",
        description: "可配置向量与密钥的 AES 工具。",
        status: "soon"
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
  }
];
