import { NextResponse } from 'next/server';
import { getNetSuiteAPIClient } from '@/lib/netsuite-client';

function convertToCSV(data: any[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows = [];

  // Add headers
  csvRows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      let value = row[header];
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      } else {
        value = String(value);
      }
      return `"${value.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

function convertToHTML(data: any[]): string {
  if (!data || data.length === 0) {
    return '<table><tr><td>No data</td></tr></table>';
  }

  const headers = Object.keys(data[0]);
  let html = '<table border="1" style="border-collapse: collapse; width: 100%;">';
  
  // Header row
  html += '<thead><tr>';
  headers.forEach(header => {
    html += `<th style="padding: 8px; background-color: #f2f2f2;">${header}</th>`;
  });
  html += '</tr></thead>';

  // Data rows
  html += '<tbody>';
  for (const row of data) {
    html += '<tr>';
    headers.forEach(header => {
      const value = row[header];
      const displayValue = value === null || value === undefined 
        ? '' 
        : (typeof value === 'object' ? JSON.stringify(value) : String(value));
      html += `<td style="padding: 8px;">${displayValue}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table>';

  return html;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, format } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    // 驗證 NetSuite 環境變數
    const requiredEnvVars = [
      'NETSUITE_ACCOUNT_ID',
      'NETSUITE_CONSUMER_KEY',
      'NETSUITE_CONSUMER_SECRET',
      'NETSUITE_TOKEN_ID',
      'NETSUITE_TOKEN_SECRET',
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingVars.length > 0) {
      console.error('Missing NetSuite environment variables:', missingVars);
      return NextResponse.json(
        { 
          error: `NetSuite 環境變數未設定: ${missingVars.join(', ')}` 
        },
        { status: 500 }
      );
    }

    const startTime = Date.now();
    let result;
    let timeTaken;

    try {
      const netsuite = getNetSuiteAPIClient();
      result = await netsuite.executeSuiteQL(query);
      timeTaken = Date.now() - startTime;
    } catch (netsuiteError: any) {
      console.error('NetSuite API Error:', netsuiteError);
      timeTaken = Date.now() - startTime;
      
      // 傳遞更詳細的錯誤訊息
      const errorMessage = netsuiteError.message || 
                          netsuiteError.toString() || 
                          '執行 SuiteQL 查詢時發生錯誤';
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const rows = result.items || [];
    const rowCount = rows.length;

    // Handle different formats
    switch (format) {
      case 'CSV':
        const csvData = convertToCSV(rows);
        return new NextResponse(csvData, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="suiteql_results_${Date.now()}.csv"`,
          },
        });

      case 'JSON':
        return new NextResponse(JSON.stringify(rows, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="suiteql_results_${Date.now()}.json"`,
          },
        });

      case 'HTML':
        const htmlData = convertToHTML(rows);
        return new NextResponse(htmlData, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        });

      case 'PDF':
        // PDF generation would require a library like puppeteer or pdfkit
        // For now, return error or use HTML format as fallback
        return NextResponse.json(
          { error: 'PDF format is not yet implemented. Please use HTML format instead.' },
          { status: 501 }
        );

      case 'Table':
      default:
        // Return JSON for preview
        return NextResponse.json({
          rows,
          rowCount,
          timeTaken,
          hasMore: result.hasMore || false,
        });
    }
  } catch (error: any) {
    console.error('SuiteQL Query Error:', error);
    
    // Try to extract meaningful error message
    let errorMessage = '執行查詢時發生錯誤';
    if (error.message) {
      errorMessage = error.message;
    } else if (error.response?.data) {
      errorMessage = JSON.stringify(error.response.data);
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

