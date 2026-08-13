import { memo, useEffect, useRef, useState } from 'react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

import styles from './CodeBlock.module.scss';

const logger = createScopedLogger('CodeBlock');

interface CodeBlockProps {
  className?: string;
  code: string;
  language?: BundledLanguage | SpecialLanguage;
  theme?: 'light-plus' | 'dark-plus';
  disableCopy?: boolean;
  isStreaming?: boolean;
}

export const CodeBlock = memo(
  ({ className, code, language = 'plaintext', theme = 'dark-plus', disableCopy = false, isStreaming = false }: CodeBlockProps) => {
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [copied, setCopied] = useState(false);
    const pendingCodeRef = useRef<string | null>(null);

    const copyToClipboard = () => {
      if (copied) {
        return;
      }

      navigator.clipboard.writeText(code);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    };

    useEffect(() => {
      if (language && !isSpecialLang(language) && !(language in bundledLanguages)) {
        logger.warn(`Unsupported language '${language}'`);
      }

      logger.trace(`Language = ${language}`);

      /*
       * Performance: skip shiki syntax highlighting while streaming.
       * Show plain text during streaming, then highlight once complete.
       */
      if (isStreaming) {
        pendingCodeRef.current = code;
        setHTML(undefined);
        return;
      }

      pendingCodeRef.current = null;

      const processCode = async () => {
        setHTML(await codeToHtml(code, { lang: language, theme }));
      };

      processCode();
    }, [code, isStreaming]);

    /*
     * When streaming ends, apply syntax highlighting to the final code.
     * This runs once after isStreaming flips to false.
     */
    useEffect(() => {
      if (!isStreaming && pendingCodeRef.current !== null) {
        const finalCode = pendingCodeRef.current;
        pendingCodeRef.current = null;

        const processCode = async () => {
          setHTML(await codeToHtml(finalCode, { lang: language, theme }));
        };

        processCode();
      }
    }, [isStreaming]);

    return (
      <div className={classNames('relative group text-left', className)}>
        <div
          className={classNames(
            styles.CopyButtonContainer,
            'bg-transparant absolute top-[10px] right-[10px] rounded-md z-10 text-lg flex items-center justify-center opacity-0 group-hover:opacity-100',
            {
              'rounded-l-0 opacity-100': copied,
            },
          )}
        >
          {!disableCopy && (
            <button
              className={classNames(
                'flex items-center bg-accent-500 p-[6px] justify-center before:bg-white before:rounded-l-md before:text-gray-500 before:border-r before:border-gray-300 rounded-md transition-theme',
                {
                  'before:opacity-0': !copied,
                  'before:opacity-100': copied,
                },
              )}
              title="Copy Code"
              onClick={() => copyToClipboard()}
            >
              <div className="i-ph:clipboard-text-duotone"></div>
            </button>
          )}
        </div>
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }}></div>
        ) : (
          <pre className="overflow-x-auto p-4 text-sm">
            <code>{code}</code>
          </pre>
        )}
      </div>
    );
  },
);
