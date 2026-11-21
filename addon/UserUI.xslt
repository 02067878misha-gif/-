<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:corel="Corel Framework Data" exclude-result-prefixes="corel">
  <corel:uiconfig>
    <corel:compositeNode xPath="/uiConfig/commandBars/commandBarData[@guid='cdb9ea9c-223e-4865-97a6-31c007c69674']"/>
  </corel:uiconfig>
  <xsl:template match="@*|node()">
    <xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy>
  </xsl:template>
  <xsl:template match="commandBarData[@guid='cdb9ea9c-223e-4865-97a6-31c007c69674']/menu">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()"/>
      <xsl:if test="not(item[@guidRef='aa1d3465-12bf-41b0-bb52-649c67cef6e5'])">
        <item guidRef="aa1d3465-12bf-41b0-bb52-649c67cef6e5"/>
      </xsl:if>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
