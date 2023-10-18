// https://datatracker.ietf.org/doc/html/rfc4180

const terminals = new Map(
  [
    [
      "COMMA",
      0x2C
    ], [
      "CR",
      0x0D
    ], [
      "LF",
      0x0A
    ], [
      "DQUOTE",
      0x22
    ], [
      "TEXTDATA_1_LB",
      0x20
    ], [
      "TEXTDATA_1_UB",
      0x21
    ], [
      "TEXTDATA_2_LB",
      0x23
    ], [
      "TEXTDATA_2_UB",
      0x2B
    ], [
      "TEXTDATA_3_LB",
      0x2E
    ], [
      "TEXTDATA_3_UB",
      0x7E
    ], [
      "TEXTDATA_4",
      0x2D
    ]
  ]
);

[
  ...terminals.keys()
].forEach(
  v => {
    terminals.set(
      v,
      String.fromCharCode(
        terminals.get(
          v
        )
      )
    )
  }
);

const characterSets = new Map(
  [
    [
      "CRLF", 
      [
        `${
          terminals.get(
            "CR"
          )
        }${
          terminals.get(
            "LF"
          )
        }`,
        "1,"
      ]
    ], [
      "TEXTDATA",
      [
        `${
          terminals.get(
            "TEXTDATA_1_LB"
          )
        }-${
          terminals.get(
            "TEXTDATA_1_UB"
          )
        }${
          terminals.get(
            "TEXTDATA_2_LB"
          )
        }-${
          terminals.get(
            "TEXTDATA_2_UB"
          )
        }${
          terminals.get(
            "TEXTDATA_3_LB"
          )
        }-${
          terminals.get(
            "TEXTDATA_3_UB"
          )
        }${
          terminals.get(
            "TEXTDATA_4"
          )
        }`,
        "1,"
      ]
    ], [
      "COMMA",
      [
        `${
          terminals.get(
            "COMMA"
          )
        }`,
        "1"
      ]
    ], [
      "DQUOTE",
      [
        `${
          terminals.get(
            "DQUOTE"
          )
        }`,
        "1"
      ]
    ]
  ]
);

function * tokenizationStation(
  document,
  terminals
){
  const gex = new RegExp(
    [
      ...terminals.entries()
    ].map(
      ([
        name,
        [
          pattern,
          count
        ]
      ]) => `(?<${
        name
      }>[${
        pattern
      }]{${
        count
      }})`
    ).join("|"),
    "g"
  )
  let result
  while(
    (result = gex.exec(
      document
    ))
  ){
    for(
      const k of terminals.keys()
    ){
      if(
        typeof result.groups !== "undefined" && 
        typeof result.groups[k] === "string"
      ) yield [
        k,
        result.groups[k]
      ]
    }
  }
}

function getEscaped(
  tokens,
  cursor
){
  const finalTokensIdx = tokens.length - 1
  if(
    cursor <= finalTokensIdx && 
    tokens[cursor][0] === "DQUOTE"
  ){
    const r = [
      tokens[cursor][1]
    ]
    cursor++
    const innerNonDquoteTypes = new Set(
      [
        "TEXTDATA",
        "COMMA",
        "CRLF"
      ]
    )
    let unterminated = false
    while(true){
      if(
        innerNonDquoteTypes.has(
          tokens[cursor][0]
        )
      ){
        r.push(
          tokens[cursor][1]
        )
        cursor++
        continue
      } else if(
        cursor === finalTokensIdx && 
        tokens[cursor][0] === "DQUOTE"
      ){
        r.push(
          tokens[cursor][1]
        )
        cursor++
        return [
          cursor,
          r.join("")
        ]
      } else if(
        cursor === finalTokensIdx && 
        unterminated
      ){
        throw `\nPARSE ERROR: Expected an escaped field. Expected to find a terminating double quote character.\n\nToken Type: ${
          tokens[cursor][0]
        }\n\nToken Value: ${
          tokens[cursor][1]
        }\n`
      } else if(
        tokens[cursor][0] === "DQUOTE" &&
        tokens[cursor + 1][0] === "DQUOTE"
      ){
        unterminated = true
        r.push(
          tokens[cursor][1]
        )
        cursor++
        r.push(
          tokens[cursor][1]
        )
        cursor++
        continue
      } else if(
        tokens[cursor][0] === "DQUOTE"
      ){
        unterminated = false
        r.push(
          tokens[cursor][1]
        )
        cursor++
        return [
          cursor,
          r.join("")
        ]
      } else {
        throw "\nUNEXPECTED PARSE ERROR\n\n"
      }
    }
  } else {
    return [
      -1,
      ""
    ]
  }
}

function getNonEscaped(
  tokens,
  cursor
){
  const finalTokensIdx = tokens.length - 1
  const r = []
  while(
    cursor <= finalTokensIdx &&
    tokens[cursor][0] === "TEXTDATA"
  ){
    r.push(
      tokens[cursor][1]
    )
    cursor++
  }
  return [
    cursor,
    r.join("")
  ]
/*  if(r.length){
    return [
      cursor,
      r
    ]
  } else {
    return [
      -1,
      r
    ]
  }*/
}

function getField(
  tokens,
  cursor
){
  const [
    newCursor,
    field
  ] = getEscaped(
    tokens,
    cursor
  )
  if(newCursor < 0){
    return getNonEscaped(
      tokens,
      cursor
    )
  } else {
    return [
      newCursor,
      field
    ]
  }
}

function parsicles(
  document,
  header = true
){
  let cursor = 0
  const tokens = []
  for(const arr of tokenizationStation(
    document,
    characterSets
  )){
    tokens.push(arr)
  }
  let fileState = header ? "headerCRLF" : "firstRecord"
  let headerCRLFState = "header"
  let headerState = "firstField"
  let recordState = "firstField"
  const AST = new Map()
  let quit = false
  while(cursor < tokens.length){
    switch(fileState){
      case "headerCRLF": {
        switch(headerCRLFState){
          case "header": {
            switch(headerState){
              case "firstField": {
                const [
                  newCursor,
                  field
                ] = getField(
                  tokens,
                  cursor
                )
                if(newCursor < 0) {
                  throw `\nPARSE ERROR: Expected to find first header field but didn't.\n\nToken Type: ${
                    tokens[cursor][0]
                  }\n\nToken Value: ${
                    tokens[cursor][1]
                  }\n`
                } else {
                  cursor = newCursor
                  AST.set(
                    "header",
                    [
                      field
                    ]
                  )
                  headerState = "nthFieldOpt"
                  continue
                }
              }
              case "nthFieldOpt": {
                if(
                  tokens[cursor][0] === "COMMA"
                ){
                  cursor++
                  const [
                    newCursor,
                    field
                  ] = getField(
                    tokens,
                    cursor
                  )
                  if(newCursor < 0) {
                    throw `\nPARSE ERROR: last token was a comma so expected to find another header field but didn't.\n\nToken Type: ${
                      tokens[cursor][0]
                    }\n\nToken Value: ${
                      tokens[cursor][1]
                    }\n`
                  } else {
                    cursor = newCursor
                    AST.set(
                      "header",
                      [
                        ...[
                          ...AST.get(
                            "header"
                          )
                        ],
                        field
                      ]
                    )
                    continue
                  }
                } else {
                  headerCRLFState = "CRLF"
                  continue
                }
              }
            }
          }
          case "CRLF": {
            if(
              tokens[cursor][0] === "CRLF"
            ){
              cursor++
              fileState = "firstRecord"
              continue
            } else {
              throw `\nPARSE ERROR: expected to find a line termination sequence to terminate header line but didn't.\n\nToken Type: ${
                tokens[cursor][0]
              }\n\nToken Value: ${
                tokens[cursor][1]
              }\n`
            }
          }
        }
      }
      case "firstRecord": {
        switch(recordState){
          case "firstField": {
            const [
              newCursor,
              field
            ] = getField(
              tokens,
              cursor
            )
            if(newCursor < 0) {
              throw `\nPARSE ERROR: Expected to find first field of a record but didn't.\n\nToken Type: ${
                tokens[cursor][0]
              }\n\nToken Value: ${
                tokens[cursor][1]
              }\n`
            } else {
              cursor = newCursor
              AST.set(
                "records",
                [
                  [
                    field
                  ]
                ]
              )
              recordState = "nthFieldOpt"
              continue
            }
          }
          case "nthFieldOpt": {
            if(
              tokens[cursor][0] === "COMMA"
            ){
              cursor++
              const [
                newCursor,
                field
              ] = getField(
                tokens,
                cursor
              )
              if(newCursor < 0) {
                throw `\nPARSE ERROR: last token was a comma so expected to find another record field but didn't.\n\nToken Type: ${
                  tokens[cursor][0]
                }\n\nToken Value: ${
                  tokens[cursor][1]
                }\n`
              } else {
                cursor = newCursor
                const records = [...AST.get(
                  "records"
                )]
                const latestRecord = records[
                  records.length - 1
                ]
                latestRecord.push(
                  field
                )
                continue
              }
            } else {
              fileState = "nthRecordOpt"
              recordState = "CRLF"
              continue
            }
          }
        }
      }
      case "nthRecordOpt": {
        switch(recordState){
          case "CRLF": {
            if(
              tokens[cursor][0] === "CRLF"
            ){
              recordState = "firstField"
              cursor++
              continue
            } else {
              fileState = "CRLF"
              continue
            }
          }
          case "firstField": {
            const [
              newCursor,
              field
            ] = getField(
              tokens,
              cursor
            )
            if(newCursor < 0) {
              throw `\nPARSE ERROR: Expected to find first field of a record but didn't.\n\nToken Type: ${
                tokens[cursor][0]
              }\n\nToken Value: ${
                tokens[cursor][1]
              }\n`
            } else {
              cursor = newCursor
              AST.set(
                "records",
                [
                  ...AST.get(
                    "records"
                  ),
                  [
                    field
                  ]
                ]
              )
              recordState = "nthFieldOpt"
              continue
            }
          }
          case "nthFieldOpt": {
            if(
              tokens[cursor][0] === "COMMA"
            ){
              cursor++
              const [
                newCursor,
                field
              ] = getField(
                tokens,
                cursor
              )
              if(newCursor < 0) {
                throw `\nPARSE ERROR: last token was a comma so expected to find another record field but didn't.\n\nToken Type: ${
                  tokens[cursor][0]
                }\n\nToken Value: ${
                  tokens[cursor][1]
                }\n`
              } else {
                cursor = newCursor
                const records = [...AST.get(
                  "records"
                )]
                const latestRecord = records[
                  records.length - 1
                ]
                latestRecord.push(
                  field
                )
                continue
              }
            } else {
              recordState = "CRLF"
              continue
            }
          }
        }
      }
      case "CRLF": {
        console.log(
          "YAY. All done parsing CSV."
        )
        quit = true
        continue
      }
    }
    if(quit) break
  }
  return AST
}

function unescape(
  escaped
){
  if(
    escaped.startsWith(
      "\""
    )
  ){
    return escaped.slice(
      1,
      escaped.length - 1
    ).replaceAll(
      "\"\"",
      "\""
    )
  } else {
    return escaped
  }
}

function escape(
  unescaped
){
  return `"${
    unescaped.replaceAll(
      "\"",
      "\"\""
    )
  }"`
}

export {
  escape,
  unescape,
  tokenizationStation,
  parsicles,
  getEscaped,
  getNonEscaped,
  getField,
  characterSets,
  terminals
}
