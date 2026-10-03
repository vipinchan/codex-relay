#include "md4c.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static int enter_block(MD_BLOCKTYPE type, void *detail, void *data) { return 0; }
static int leave_block(MD_BLOCKTYPE type, void *detail, void *data) { return 0; }
static int enter_span(MD_SPANTYPE type, void *detail, void *data) {
  if (type == MD_SPAN_STRONG) { fputs("<strong>", stdout); }
  if (type == MD_SPAN_CODE) fputs("<code>", stdout);
  return 0;
}
static int leave_span(MD_SPANTYPE type, void *detail, void *data) {
  if (type == MD_SPAN_STRONG) { fputs("</strong>", stdout); }
  if (type == MD_SPAN_CODE) fputs("</code>", stdout);
  return 0;
}
static int text(MD_TEXTTYPE type, const MD_CHAR *text, MD_SIZE size, void *data) {
  fwrite(text, 1, size, stdout); return 0;
}
int main(void) {
  char *input = NULL; size_t size = 0, capacity = 0; int ch;
  while ((ch = getchar()) != EOF) {
    if (size == capacity) { capacity = capacity ? capacity * 2 : 256; input = realloc(input, capacity); if (!input) return 2; }
    input[size++] = (char) ch;
  }
  MD_PARSER parser = {0, MD_FLAG_NOHTML | MD_FLAG_STRIKETHROUGH | MD_FLAG_TABLES | MD_FLAG_TASKLISTS | MD_FLAG_SPOILERS,
    enter_block, leave_block, enter_span, leave_span, text, NULL, NULL};
  int status = md_parse(input ? input : "", size, &parser, NULL);
  free(input); return status;
}
